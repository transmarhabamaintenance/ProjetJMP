import { UserRole } from '../domain/enums';

export interface LoginRequest {
  username?: string;
  password?: string;
}

export interface UserDto {
  id: number;
  username: string;
  fullName: string | null;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: UserDto;
}

export interface CreateUserRequest {
  username?: string;
  password?: string;
  fullName?: string;
  role?: UserRole;
}

/** PATCH /api/auth/users/{id} : tous les champs optionnels. */
export interface UpdateUserRequest {
  password?: string;
  fullName?: string;
  role?: UserRole;
}
