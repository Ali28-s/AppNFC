import React from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { signOut } from 'firebase/auth';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { auth } from '../services/firebaseConfig';
import { useDocenteAuth } from '../services/docenteAuth';

type DocenteScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Docente'>;
};

export default function DocenteScreen({ navigation }: DocenteScreenProps) {
  const { docente } = useDocenteAuth();

  const cerrarSesion = async () => {
    try {
      await signOut(auth);
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      Alert.alert('No se pudo cerrar sesión', mensaje);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Panel del Docente</Text>
      <Text style={styles.subtitulo}>
        {docente?.nombre ?? 'Docente'}{'\n'}Selecciona una opción para continuar
      </Text>

      <View style={styles.menuContainer}>
        {/* Botón para ir al Lector NFC (LectorScreen) */}
        <TouchableOpacity 
          style={styles.boton} 
          onPress={() => navigation.navigate('Lector')}
        >
          <Text style={styles.textoBoton}>📶 Registrar Asistencia (NFC)</Text>
        </TouchableOpacity>

        {/* Botón para Agregar Estudiante */}
        <TouchableOpacity 
          style={[styles.boton, styles.botonSecundario]} 
          onPress={() => navigation.navigate('AgregarEstudiante')} // <-- Cambiamos el alert por la navegación
        >
          <Text style={styles.textoBotonSecundario}>➕ Registrar Nuevo Estudiante</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={() => navigation.navigate('CrearCurso')}
        >
          <Text style={styles.textoBotonSecundario}>📚 Crear curso</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={() => navigation.navigate('Cursos')}
        >
          <Text style={styles.textoBotonSecundario}>📖 Ver mis cursos</Text>
        </TouchableOpacity>
        

       {/* Botón para Ver Reportes */}
        <TouchableOpacity 
          style={[styles.boton, styles.botonSecundario]} 
          onPress={() => navigation.navigate('Reportes')} // <-- Conectado a la pantalla de reportes
        >
          <Text style={styles.textoBotonSecundario}>📊 Ver Reportes de Asistencia</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonCerrarSesion} onPress={cerrarSesion}>
        <Text style={styles.textoCerrarSesion}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25, backgroundColor: '#f5f6fa' },
  titulo: { fontSize: 26, fontWeight: 'bold', color: '#2f3640', marginBottom: 5 },
  subtitulo: { fontSize: 16, color: '#718093', marginBottom: 40, textAlign: 'center' },
  menuContainer: { width: '100%', gap: 15 },
  boton: { backgroundColor: '#00a8ff', paddingVertical: 18, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  botonSecundario: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#00a8ff' },
  textoBoton: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  textoBotonSecundario: { color: '#00a8ff', fontSize: 18, fontWeight: 'bold' },
  botonCerrarSesion: { marginTop: 24, padding: 12 },
  textoCerrarSesion: { color: '#d63031', fontSize: 16, fontWeight: '600' },
});