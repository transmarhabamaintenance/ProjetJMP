import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../domain/enums';
import { AuthService } from './auth.service';
import { CreateUserRequest, LoginRequest, LoginResponse, UpdateUserRequest, UserDto } from './auth.dto';
import { AuthUser, CurrentUser, Public, Roles } from './auth.decorators';

@ApiTags('Authentification')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Ouvre une session et renvoie le JWT' })
  login(@Body() request: LoginRequest): Promise<LoginResponse> {
    return this.authService.login(request.username, request.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compte de la session en cours' })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.authService.me(user.id);
  }

  @Post('users')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crée un compte (réservé à un administrateur)' })
  create(@Body() request: CreateUserRequest): Promise<UserDto> {
    return this.authService.create(request);
  }

  @Get('users')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste les comptes (réservé à un administrateur)' })
  list(): Promise<UserDto[]> {
    return this.authService.list();
  }

  @Put('users/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change le rôle, le nom ou le mot de passe d'un compte" })
  update(@Param('id', ParseIntPipe) id: number, @Body() request: UpdateUserRequest): Promise<UserDto> {
    return this.authService.update(id, request);
  }

  @Delete('users/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprime un compte' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.authService.remove(id);
  }
}
