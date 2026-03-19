import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService, User } from './users.service';

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
    users: User[] = [];
    newUser: User = { email: '', role: 'OPERATOR', passwordHash: '' };
    showCreateModal = false;
    isLoading = false;
    errorMessage = '';

    constructor(private usersService: UsersService, private cdr: ChangeDetectorRef) { }

    ngOnInit(): void {
        this.loadUsers();
    }

    loadUsers(): void {
        this.isLoading = true;
        this.usersService.getUsers().subscribe({
            next: (data: any) => {
                this.users = data;
                this.cdr.detectChanges();
                this.isLoading = false;
            },
            error: () => {
                this.errorMessage = 'Error al cargar los usuarios';
                this.isLoading = false;
            }
        });
    }

    toggleModal(): void {
        this.showCreateModal = !this.showCreateModal;
        if (!this.showCreateModal) {
            this.resetForm();
        }
    }

    resetForm(): void {
        this.newUser = { email: '', role: 'OPERATOR', passwordHash: '' };
        this.errorMessage = '';
    }

    onCreate(): void {
        if (!this.newUser.email || !this.newUser.passwordHash) {
            this.errorMessage = 'El correo y la contraseña son obligatorios';
            return;
        }

        this.isLoading = true;
        this.usersService.createUser(this.newUser).subscribe({
            next: () => {
                this.loadUsers();
                this.toggleModal();
                this.isLoading = false; // Reset loading state
                this.cdr.detectChanges();
            },
            error: (err: any) => {
                this.errorMessage = err.error?.message || 'Error al crear el usuario';
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    onDelete(id: string | undefined): void {
        if (!id || !confirm('¿Seguro que desea eliminar este usuario? Esta acción no se puede deshacer.')) return;

        this.usersService.deleteUser(id).subscribe({
            next: () => this.loadUsers(),
            error: () => this.errorMessage = 'Error al eliminar el usuario'
        });
    }
}
