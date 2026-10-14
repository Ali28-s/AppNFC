import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { RootStackParamList } from '../navigation/AppNavigator';
import { db } from '../services/firebaseConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'CursoDetalle'>;

interface EstudianteCurso {
  id: string;
  nombres: string;
  apellidos: string;
  numeroLista: string;
}

export default function CursoDetalleScreen({ route }: Props) {
  const { cursoId } = route.params;
  const [curso, setCurso] = useState<Record<string, unknown> | null>(null);
  const [estudiantes, setEstudiantes] = useState<EstudianteCurso[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activa = true;

    const cargarDetalle = async () => {
      try {
        const [cursoSnapshot, estudiantesResultado] = await Promise.all([
          getDoc(doc(db, 'cursos', cursoId)),
          getDocs(
            query(collection(db, 'usuarios'), where('cursoIds', 'array-contains', cursoId)),
          ),
        ]);
        if (!cursoSnapshot.exists()) {
          throw new Error('El curso ya no existe o no está disponible.');
        }

        const inscritos = estudiantesResultado.docs
          .map((documento): EstudianteCurso => {
            const datos = documento.data();
            return {
              id: documento.id,
              nombres: typeof datos.nombres === 'string' ? datos.nombres : 'Sin nombre',
              apellidos: typeof datos.apellidos === 'string' ? datos.apellidos : '',
              numeroLista:
                typeof datos.numeroLista === 'number' ? String(datos.numeroLista) : '',
            };
          })
          .sort((a, b) => a.nombres.localeCompare(b.nombres));

        if (activa) {
          setCurso(cursoSnapshot.data());
          setEstudiantes(inscritos);
        }
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error('No se pudo cargar el detalle del curso:', error);
        if (activa) Alert.alert('Error al cargar el curso', mensaje);
      } finally {
        if (activa) setCargando(false);
      }
    };

    void cargarDetalle();
    return () => {
      activa = false;
    };
  }, [cursoId]);

  const texto = (campo: string) =>
    curso && typeof curso[campo] === 'string' ? (curso[campo] as string) : '';
  const nombreMateria = texto('materia') || 'Curso';
  const codigo = texto('cursoIdCustom') || cursoId;

  return (
    <View style={styles.container}>
      {cargando ? (
        <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
      ) : curso ? (
        <>
          <Text style={styles.titulo}>{nombreMateria}</Text>
          <Text style={styles.codigo}>Código: {codigo}</Text>
          <Text style={styles.descripcion}>
            {texto('descripcion') || 'Este curso no tiene una descripción.'}
          </Text>
          <Text style={styles.seccion}>
            Estudiantes inscritos ({estudiantes.length})
          </Text>
          <FlatList
            data={estudiantes}
            keyExtractor={(estudiante) => estudiante.id}
            renderItem={({ item }) => (
              <View style={styles.estudiante}>
                <Text style={styles.nombre}>
                  {item.nombres} {item.apellidos}
                </Text>
                {item.numeroLista ? (
                  <Text style={styles.numero}>N.º de lista: {item.numeroLista}</Text>
                ) : null}
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.vacio}>Aún no hay estudiantes inscritos en este curso.</Text>
            }
            contentContainerStyle={styles.lista}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f6fa' },
  loader: { marginTop: 35 },
  titulo: { color: '#2f3640', fontSize: 25, fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  codigo: { color: '#57606f', textAlign: 'center', marginTop: 8 },
  descripcion: { color: '#2f3640', backgroundColor: '#fff', padding: 15, borderRadius: 10, marginTop: 18, lineHeight: 21 },
  seccion: { color: '#2f3640', fontSize: 18, fontWeight: 'bold', marginTop: 22, marginBottom: 10 },
  lista: { paddingBottom: 20 },
  estudiante: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 9 },
  nombre: { color: '#2f3640', fontSize: 16, fontWeight: '600' },
  numero: { color: '#718093', marginTop: 4 },
  vacio: { color: '#718093', textAlign: 'center', marginTop: 20 },
});
