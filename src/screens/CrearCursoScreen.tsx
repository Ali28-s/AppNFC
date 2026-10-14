import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { RootStackParamList } from '../navigation/AppNavigator';
import { db } from '../services/firebaseConfig';
import { useDocenteAuth } from '../services/docenteAuth';

type CrearCursoNavigation = NativeStackNavigationProp<RootStackParamList, 'CrearCurso'>;

export default function CrearCursoScreen({
  navigation,
}: {
  navigation: CrearCursoNavigation;
}) {
  const { docente } = useDocenteAuth();
  const [cursoIdCustom, setCursoIdCustom] = useState('');
  const [materia, setMateria] = useState('');
  const [nivel, setNivel] = useState('');
  const [paralelo, setParalelo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [aula, setAula] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cargando, setCargando] = useState(false);

  const crearCurso = async () => {
    const codigo = cursoIdCustom.trim();
    const datosCurso = {
      materia: materia.trim(),
      nivel: nivel.trim(),
      paralelo: paralelo.trim().toUpperCase(),
      periodo: periodo.trim(),
      aula: aula.trim(),
      descripcion: descripcion.trim(),
    };
    const camposRequeridos = [
      datosCurso.materia,
      datosCurso.nivel,
      datosCurso.paralelo,
      datosCurso.periodo,
      datosCurso.aula,
    ];

    if (!docente) {
      Alert.alert('Sesión docente requerida', 'Inicia sesión de nuevo para crear un curso.');
      return;
    }
    if (!codigo || camposRequeridos.some((valor) => !valor)) {
      Alert.alert('Datos incompletos', 'Completa el código, materia, nivel, paralelo, periodo y aula.');
      return;
    }

    setCargando(true);
    try {
      const cursosExistentes = await getDocs(
        query(collection(db, 'cursos'), where('cursoIdCustom', '==', codigo)),
      );
      const cursoDuplicado = cursosExistentes.docs.some(
        (documento) => documento.data().profesorId === docente.profesorId,
      );
      if (cursoDuplicado) {
        Alert.alert('Curso duplicado', 'Ya tienes un curso con ese código.');
        return;
      }

      const cursoRef = doc(collection(db, 'cursos'));
      await setDoc(cursoRef, {
        ...datosCurso,
        cursoIdCustom: codigo,
        profesorId: docente.profesorId,
      });

      Alert.alert('Curso creado', `El curso ${codigo} se guardó correctamente.`);
      navigation.navigate('Cursos');
      setCursoIdCustom('');
      setMateria('');
      setNivel('');
      setParalelo('');
      setPeriodo('');
      setAula('');
      setDescripcion('');
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      Alert.alert('No se pudo crear el curso', mensaje);
    } finally {
      setCargando(false);
    }
  };

  const campo = (
    etiqueta: string,
    valor: string,
    cambiar: (valor: string) => void,
    placeholder: string,
  ) => (
    <>
      <Text style={styles.label}>{etiqueta}</Text>
      <TextInput
        style={styles.input}
        value={valor}
        onChangeText={cambiar}
        placeholder={placeholder}
        placeholderTextColor="#a4b0be"
        editable={!cargando}
        autoCapitalize="sentences"
      />
    </>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Crear curso</Text>
      <Text style={styles.subtitulo}>
        El curso quedará vinculado a tu identificador docente.
      </Text>

      <View style={styles.formulario}>
        {campo('Código del curso:', cursoIdCustom, setCursoIdCustom, 'Ej. 100A36')}
        {campo('Materia:', materia, setMateria, 'Ej. Aplicaciones Nativas')}
        {campo('Nivel:', nivel, setNivel, 'Ej. sexto semestre')}
        {campo('Paralelo:', paralelo, setParalelo, 'Ej. A')}
        {campo('Periodo:', periodo, setPeriodo, 'Ej. 2026-1')}
        {campo('Aula:', aula, setAula, 'Ej. 308')}
        <Text style={styles.label}>Descripción (opcional):</Text>
        <TextInput
          style={[styles.input, styles.descripcion]}
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Descripción del curso"
          placeholderTextColor="#a4b0be"
          editable={!cargando}
          multiline
          textAlignVertical="top"
        />

        {cargando ? (
          <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
        ) : (
          <TouchableOpacity style={styles.boton} onPress={crearCurso}>
            <Text style={styles.textoBoton}>Guardar curso</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f5f6fa' },
  titulo: { fontSize: 25, fontWeight: 'bold', color: '#2f3640', textAlign: 'center' },
  subtitulo: { fontSize: 14, color: '#718093', marginTop: 8, marginBottom: 28, textAlign: 'center' },
  formulario: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  label: { fontSize: 15, fontWeight: '600', color: '#2f3640', marginBottom: 7 },
  input: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dcdde1',
    fontSize: 16,
    marginBottom: 16,
    color: '#2f3640',
  },
  descripcion: { minHeight: 88 },
  loader: { marginTop: 18 },
  boton: {
    backgroundColor: '#00a8ff',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  textoBoton: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
