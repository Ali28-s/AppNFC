// src/types/estudiante.ts

export interface Estudiante {
  id?: string;
  uid: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  numeroLista: number;
  fotoUrl?: string;
}

export interface Asistencia {
  id?: string;
  cursoId: string;
  estudiante: string;
  fecha: string;
  hora: string;
  materia: string;
  profesorId: string;
  uid: string;
}