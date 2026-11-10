import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from '../domain/enums';

/** Compte de l'application : simple utilisateur ou administrateur. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  /** Empreinte bcrypt, jamais le mot de passe en clair. */
  @Column()
  passwordHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fullName: string;

  @Column({ type: 'varchar', default: UserRole.USER })
  role: UserRole;

  constructor(username?: string, passwordHash?: string, role?: UserRole, fullName?: string) {
    if (username !== undefined) {
      this.username = username;
      this.passwordHash = passwordHash;
      this.role = role ?? UserRole.USER;
      this.fullName = fullName;
    }
  }
}
