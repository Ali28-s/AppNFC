import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import CrearCursoScreen from '../screens/CrearCursoScreen';
import DocenteScreen from '../screens/DocenteScreen';
import LectorScreen from '../screens/LectorScreen';
import AgregarEstudianteScreen from '../screens/AgregarEstudianteScreen';
import LoginDocenteScreen from '../screens/LoginDocenteScreen';
import ReportesScreen from '../screens/ReportesScreen';
import CursosScreen from '../screens/CursosScreen';
import CursoDetalleScreen from '../screens/CursoDetalleScreen';
import { DocenteAuthProvider, useDocenteAuth } from '../services/docenteAuth';

export type RootStackParamList = {
  LoginDocente: undefined;
  Docente: undefined;
  Lector: undefined;
  AgregarEstudiante: undefined;
  CrearCurso: undefined;
  Cursos: undefined;
  CursoDetalle: { cursoId: string };
  Reportes: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function NavegacionAutenticada() {
  const { docente } = useDocenteAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator key={docente ? 'docente' : 'login'}>
        {docente ? (
          <>
            <Stack.Screen name="Docente" component={DocenteScreen} options={{ title: 'Panel Docente' }} />
            <Stack.Screen name="Lector" component={LectorScreen} options={{ title: 'Lector NFC y Foto' }} />
            <Stack.Screen name="AgregarEstudiante" component={AgregarEstudianteScreen} options={{ title: 'Nuevo Estudiante' }} />
            <Stack.Screen name="Cursos" component={CursosScreen} options={{ title: 'Mis cursos' }} />
            <Stack.Screen name="CursoDetalle" component={CursoDetalleScreen} options={{ title: 'Detalle del curso' }} />
            <Stack.Screen name="CrearCurso" component={CrearCursoScreen} options={{ title: 'Crear curso' }} />
            <Stack.Screen name="Reportes" component={ReportesScreen} options={{ title: 'Reportes de Asistencia' }} />
          </>
        ) : (
          <Stack.Screen
            name="LoginDocente"
            component={LoginDocenteScreen}
            options={{ title: 'Acceso docente', headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator() {
  return (
    <DocenteAuthProvider>
      <NavegacionAutenticada />
    </DocenteAuthProvider>
  );
}