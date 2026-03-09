import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export interface User {
    id?: string;
    email: string;
    passwordHash?: string; // Only needed for creation
    role: 'ADMIN' | 'OPERATOR';
    createdAt?: string;
}

@Injectable({
    providedIn: 'root'
})
export class UsersService {
    private apiUrl = '/api/users';

    constructor(private http: HttpClient, private authService: AuthService) { }

    private getHeaders(): HttpHeaders {
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authService.getToken()}`
        });
    }

    getUsers(): Observable<User[]> {
        return this.http.get<User[]>(this.apiUrl, { headers: this.getHeaders() });
    }

    createUser(user: User): Observable<User> {
        return this.http.post<User>(this.apiUrl, user, { headers: this.getHeaders() });
    }

    deleteUser(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
    }
}
