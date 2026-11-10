import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../domain/enums';
import { User } from '../entities/user.entity';
import { CreateUserRequest, LoginResponse, UpdateUserRequest, UserDto } from './auth.dto';

const MIN_PASSWORD_LENGTH = 6;

/** Authentification (JWT) et gestion des comptes. */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Amorce (ou réamorce si la table est vide) le premier compte administrateur. */
  async ensureAdmin(username: string, password: string): Promise<boolean> {
    if (await this.userRepository.exist({ where: { role: UserRole.ADMIN } })) return false;
    await this.userRepository.save(new User(username, await this.hashPassword(password), UserRole.ADMIN, 'Administrateur'));
    return true;
  }

  /** Amorce un compte simple (rôle USER) s'il n'existe pas déjà. */
  async ensureUser(username: string, password: string, fullName?: string): Promise<boolean> {
    const name = (username ?? '').trim();
    if (!name || await this.userRepository.exist({ where: { username: name } })) return false;
    await this.userRepository.save(
      new User(name, await this.hashPassword(password), UserRole.USER, (fullName ?? '').trim() || null),
    );
    return true;
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const name = (username ?? '').trim();
    const user = name ? await this.userRepository.findOne({ where: { username: name } }) : null;
    if (!user || !(await bcrypt.compare(password ?? '', user.passwordHash))) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }
    const token = await this.jwtService.signAsync({ sub: user.id, username: user.username, role: user.role });
    return { token, user: this.toDto(user) };
  }

  async me(id: number): Promise<UserDto> {
    return this.toDto(await this.userRepository.findOne({ where: { id } }));
  }

  async list(): Promise<UserDto[]> {
    const users = await this.userRepository.find({ order: { username: 'ASC' } });
    return users.map((u) => this.toDto(u));
  }

  async create(request: CreateUserRequest): Promise<UserDto> {
    const username = (request.username ?? '').trim();
    if (username.length < 3) {
      throw new BadRequestException("L'identifiant doit contenir au moins 3 caractères");
    }
    this.checkPassword(request.password);
    if (await this.userRepository.exist({ where: { username } })) {
      throw new ConflictException(`Identifiant « ${username} » déjà utilisé`);
    }
    const role = request.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;
    const user = new User(username, await this.hashPassword(request.password), role, (request.fullName ?? '').trim() || null);
    return this.toDto(await this.userRepository.save(user));
  }

  async update(id: number, request: UpdateUserRequest): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Compte ${id} introuvable`);

    if (request.password != null) {
      this.checkPassword(request.password);
      user.passwordHash = await this.hashPassword(request.password);
    }
    if (request.fullName != null) {
      user.fullName = request.fullName.trim() || null;
    }
    if (request.role != null) {
      const role = request.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;
      if (role === UserRole.USER && user.role === UserRole.ADMIN && !(await this.hasAnotherAdmin())) {
        throw new BadRequestException('Aucun administrateur ne resterait actif');
      }
      user.role = role;
    }
    return this.toDto(await this.userRepository.save(user));
  }

  async remove(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Compte ${id} introuvable`);
    if (user.role === UserRole.ADMIN && !(await this.hasAnotherAdmin())) {
      throw new BadRequestException('Aucun administrateur ne resterait actif');
    }
    await this.userRepository.delete({ id });
  }

  private async hasAnotherAdmin(): Promise<boolean> {
    const admins = await this.userRepository.count({ where: { role: UserRole.ADMIN } });
    return admins > 1;
  }

  private checkPassword(password: string): void {
    if ((password ?? '').length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
    }
  }

  private toDto(user: User): UserDto {
    if (!user) throw new NotFoundException('Compte introuvable');
    return { id: user.id, username: user.username, fullName: user.fullName ?? null, role: user.role };
  }
}
