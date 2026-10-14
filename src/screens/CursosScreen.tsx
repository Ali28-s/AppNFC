import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useDocenteAuth } from '../services/docenteAuth';
import { db } from '../services/firebaseConfig';

export interface Curso {
  id: string;
  codigo: string;
  materia: string;
  nivel: string;
  paralelo: string;
  periodo: string;
  aula: string;
  descripcion: string;
}

type CursosNavigation = NativeStackNavigationProp<RootStackParamList, 'Cursos'>;

export default function CursosScreen({ navigation }: { navigation: CursosNavigation }) {
  const { docente } = useDocenteAuth();
  const profesorId = docente?.profesorId;
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let activa = true;

      const cargarCursos = async () => {
        if (!profesorId) {
          setCargando(false);
          return;
        }

        setCargando(true);
        try {
          const resultado = await getDocs(
            query(collection(db, 'cursos'), where('profesorId', '==', profesorId)),
          );
          const lista = resultado.docs.map((documento): Curso => {
            const datos = documento.data();
            return {
              id: documento.id,
              codigo:
                typeof datos.cursoIdCustom === 'string' && datos.cursoIdCustom.trim()
                  ? datos.cursoIdCustom.trim()
                  : documento.id,
              materia: typeof datos.materia === 'string' ? datos.materia : 'Materia sin nombre',
              nivel: typeof datos.nivel === 'string' ? datos.nivel : '',
              paralelo: typeof datos.paralelo === 'string' ? datos.paralelo : '',
              periodo: typeof datos.periodo === 'string' ? datos.periodo : '',
              aula: typeof datos.aula === 'string' ? datos.aula : '',
              descripcion: typeof datos.descripcion === 'string' ? datos.descripcion : '',
            };
          });
          lista.sort((a, b) => a.materia.localeCompare(b.materia));
          if (activa) setCursos(lista);
        } catch (error: unknown) {
          const mensaje = error instanceof Error ? error.message : String(error);
          console.error('No se pudieron cargar los cursos del docente:', error);
          if (activa) Alert.alert('Error al cargar cursos', mensaje);
        } finally {
          if (activa) setCargando(false);
        }
      };

      void cargarCursos();
      return () => {
        activa = false;
      };
    }, [profesorId]),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Mis cursos</Text>
      <Text style={styles.subtitulo}>Consulta los detalles y estudiantes inscritos.</Text>
      <TouchableOpacity
        style={styles.botonCrear}
        onPress={() => navigation.navigate('CrearCurso')}
      >
        <Text style={styles.textoBotonCrear}>+ Crear curso</Text>
      </TouchableOpacity>

      {cargando ? (
        <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
      ) : (
        <FlatList
          data={cursos}
          keyExtractor={(curso) => curso.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.tarjeta}
              onPress={() => navigation.navigate('CursoDetalle', { cursoId: item.id })}
            >
              <Text style={styles.materia}>{item.materia}</Text>
              <Text style={styles.detalle}>Código: {item.codigo}</Text>
              <Text style={styles.detalle}>
                {[item.nivel, item.paralelo && `Paralelo ${item.paralelo}`, item.periodo]
                  .filter(Boolean)
                  .join(' · ') || 'Sin nivel o periodo especificado'}
              </Text>
              <Text style={styles.accion}>Ver curso y estudiantes →</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.vacio}>Todavía no tienes cursos. Crea el primero para continuar.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f6fa' },
  titulo: { fontSize: 25, fontWeight: 'bold', color: '#2f3640', textAlign: 'center', marginTop: 10 },
  subtitulo: { fontSize: 14, color: '#718093', textAlign: 'center', marginTop: 5, marginBottom: 16 },
  botonCrear: { backgroundColor: '#00a8ff', padding: 13, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  textoBotonCrear: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  loader: { marginTop: 35 },
  lista: { paddingBottom: 20 },
  tarjeta: { backgroundColor: '#fff', padding: 17, borderRadius: 12, marginBottom: 12, elevation: 2 },
  materia: { fontSize: 19, fontWeight: 'bold', color: '#2f3640', marginBottom: 7 },
  detalle: { color: '#57606f', marginBottom: 4 },
  accion: { color: '#00a8ff', fontWeight: '600', marginTop: 7 },
  vacio: { color: '#718093', textAlign: 'center', marginTop: 35, fontSize: 16 },
});
