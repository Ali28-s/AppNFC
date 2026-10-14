import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { arrayUnion, collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, StorageReference, uploadString } from 'firebase/storage';
import { useDocenteAuth } from '../services/docenteAuth';
import { db, storage } from '../services/firebaseConfig';
import { leerUidTarjetaNfc, normalizarUidNfc } from '../services/nfcService';

interface Curso {
  id: string;
  cursoIdCustom: string;
  materia: string;
  nivel: string;
  paralelo: string;
}

interface ImagenSeleccionada {
  uri: string;
  mimeType: string;
}

interface DatosEstudiante {
  nombres: string;
  apellidos: string;
  cedula: string;
  numeroLista: number;
  fotoUrl?: string;
}

export default function AgregarEstudianteScreen() {
  const { docente } = useDocenteAuth();
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [cedula, setCedula] = useState('');
  const [numeroLista, setNumeroLista] = useState('');
  const [uidTarjeta, setUidTarjeta] = useState('');
  const [imagen, setImagen] = useState<ImagenSeleccionada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoCursos, setCargandoCursos] = useState(true);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursosSeleccionados, setCursosSeleccionados] = useState<string[]>([]);

  useEffect(() => {
    let activa = true;

    const cargarCursos = async () => {
      if (!docente?.profesorId) {
        setCargandoCursos(false);
        return;
      }

      try {
        const resultado = await getDocs(
          query(collection(db, 'cursos'), where('profesorId', '==', docente.profesorId)),
        );
        const lista = resultado.docs.map((documento) => {
          const datos = documento.data();
          return {
            id: documento.id,
            cursoIdCustom:
              typeof datos.cursoIdCustom === 'string' ? datos.cursoIdCustom : documento.id,
            materia: typeof datos.materia === 'string' ? datos.materia : 'Materia sin nombre',
            nivel: typeof datos.nivel === 'string' ? datos.nivel : '',
            paralelo: typeof datos.paralelo === 'string' ? datos.paralelo : '',
          };
        });
        if (activa) setCursos(lista);
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error('No se pudieron cargar los cursos del docente:', error);
        if (activa) Alert.alert('Error al cargar cursos', mensaje);
      } finally {
        if (activa) setCargandoCursos(false);
      }
    };

    void cargarCursos();
    return () => {
      activa = false;
    };
  }, [docente?.profesorId]);

  const seleccionarImagen = async (origen: 'camara' | 'galeria') => {
    try {
      setCargando(true);
      const permiso =
        origen === 'camara'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permiso.granted) {
        Alert.alert(
          'Permiso requerido',
          origen === 'camara'
            ? 'Permite el acceso a la cámara para tomar la fotografía.'
            : 'Permite el acceso a tus fotos para elegir una fotografía.',
        );
        return;
      }

      const resultado =
        origen === 'camara'
          ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            });

      if (!resultado.canceled) {
        setImagen({
          uri: resultado.assets[0].uri,
          mimeType: resultado.assets[0].mimeType ?? 'image/jpeg',
        });
      }
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      Alert.alert('Error al seleccionar la fotografía', mensaje);
    } finally {
      setCargando(false);
    }
  };

  const leerTarjeta = async () => {
    try {
      setCargando(true);
      const uid = await leerUidTarjetaNfc();
      const [coincidencias, documentoPorUid] = await Promise.all([
        getDocs(query(collection(db, 'usuarios'), where('uid', '==', uid))),
        getDoc(doc(db, 'usuarios', uid)),
      ]);
      const estudianteExistente =
        coincidencias.docs[0] ?? (documentoPorUid.exists() ? documentoPorUid : null);
      if (coincidencias.size > 1) {
        throw new Error('Este UID NFC ya aparece en varios registros. Corrige los duplicados en Firestore.');
      }
      if (estudianteExistente) {
        const datos = estudianteExistente.data();
        const nombreExistente = [datos.nombres, datos.apellidos]
          .filter((parte): parte is string => typeof parte === 'string' && !!parte.trim())
          .join(' ');
        setUidTarjeta('');
        Alert.alert(
          'Tarjeta ya registrada',
          `El UID ${uid} ya está asociado${nombreExistente ? ` a ${nombreExistente}` : ' a un estudiante'}. Para inscribirlo en otro curso, usa el lector NFC de asistencia.`,
        );
        return;
      }
      setUidTarjeta(uid);
      Alert.alert('Tarjeta leída', `Código NFC: ${uid}`);
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      Alert.alert('No se pudo leer la tarjeta', mensaje);
    } finally {
      setCargando(false);
    }
  };

  const guardarEstudiante = async () => {
    const datos: DatosEstudiante = {
      nombres: nombres.trim(),
      apellidos: apellidos.trim(),
      cedula: cedula.trim(),
      numeroLista: Number(numeroLista),
    };
    const uidLimpio = normalizarUidNfc(uidTarjeta);
    if (
      !datos.nombres ||
      !datos.apellidos ||
      !datos.cedula ||
      !numeroLista.trim() ||
      !uidLimpio
    ) {
      Alert.alert(
        'Datos incompletos',
        'Completa los datos del estudiante y lee su tarjeta NFC antes de guardar.',
      );
      return;
    }
    if (!Number.isInteger(datos.numeroLista) || datos.numeroLista < 0) {
      Alert.alert('Número de lista inválido', 'Ingresa un número de lista entero igual o mayor a 0.');
      return;
    }
    if (cursosSeleccionados.length === 0) {
      Alert.alert('Selecciona cursos', 'Asocia al estudiante al menos a uno de tus cursos.');
      return;
    }

    let referenciaImagen: StorageReference | null = null;
    let imagenSubida = false;
    try {
      setCargando(true);
      const [existentesPorCedula, existentesPorUid] = await Promise.all([
        getDocs(query(collection(db, 'usuarios'), where('cedula', '==', datos.cedula))),
        getDocs(query(collection(db, 'usuarios'), where('uid', '==', uidLimpio))),
      ]);
      const documentoConUidComoId = await getDoc(doc(db, 'usuarios', uidLimpio));
      if (existentesPorCedula.size > 1) {
        throw new Error('Hay varios usuarios registrados con esa cédula. Corrige los duplicados en Firestore.');
      }
      if (existentesPorUid.size > 1) {
        throw new Error('Hay varios usuarios con este UID NFC. Corrige los duplicados en Firestore.');
      }

      const usuarioExistenteCedula = existentesPorCedula.docs[0];
      const usuarioExistenteUid = existentesPorUid.docs[0] ??
        (documentoConUidComoId.exists() ? documentoConUidComoId : undefined);
      if (
        usuarioExistenteUid &&
        usuarioExistenteCedula &&
        usuarioExistenteUid.id !== usuarioExistenteCedula.id
      ) {
        throw new Error('Esta tarjeta NFC ya está asignada a otro estudiante.');
      }
      if (
        usuarioExistenteUid &&
        usuarioExistenteUid.data().cedula !== datos.cedula
      ) {
        throw new Error('Esta tarjeta NFC ya está registrada para otra persona.');
      }
      if (
        usuarioExistenteCedula &&
        typeof usuarioExistenteCedula.data().uid === 'string' &&
        normalizarUidNfc(usuarioExistenteCedula.data().uid) !== uidLimpio
      ) {
        throw new Error('La cédula ingresada ya está asociada a otra tarjeta NFC.');
      }

      const usuarioRef = usuarioExistenteCedula
        ? usuarioExistenteCedula.ref
        : usuarioExistenteUid
          ? usuarioExistenteUid.ref
          : doc(db, 'usuarios', uidLimpio);

      if (imagen) {
        const imagenBase64 = await FileSystem.readAsStringAsync(imagen.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const extension = imagen.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
        referenciaImagen = ref(
          storage,
          `estudiantes/${uidLimpio}_${Date.now()}.${extension}`,
        );
        await uploadString(referenciaImagen, imagenBase64, 'base64', {
          contentType: imagen.mimeType,
        });
        imagenSubida = true;
        datos.fotoUrl = await getDownloadURL(referenciaImagen);
      }

      const datosGuardados = {
        ...datos,
        uid: uidLimpio,
        cursoIds: arrayUnion(...cursosSeleccionados),
      };
      if (!usuarioExistenteCedula && !usuarioExistenteUid) {
        await setDoc(usuarioRef, datosGuardados);
        Alert.alert(
          'Éxito',
          `Estudiante ${datos.nombres} ${datos.apellidos} registrado correctamente.`,
        );
      } else {
        await setDoc(usuarioRef, datosGuardados, { merge: true });
        Alert.alert('Estudiante actualizado', `Se guardaron los datos y la tarjeta de ${datos.nombres}.`);
      }
      setNombres('');
      setApellidos('');
      setCedula('');
      setNumeroLista('');
      setUidTarjeta('');
      setImagen(null);
      setCursosSeleccionados([]);
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      let mensajeCompleto = mensaje;
      if (referenciaImagen && imagenSubida) {
        try {
          await deleteObject(referenciaImagen);
        } catch (errorLimpieza: unknown) {
          const mensajeLimpieza =
            errorLimpieza instanceof Error ? errorLimpieza.message : String(errorLimpieza);
          console.error('No se pudo eliminar la imagen tras fallar el registro:', errorLimpieza);
          mensajeCompleto += ` También falló la limpieza de la imagen: ${mensajeLimpieza}`;
        }
      }
      Alert.alert('Error al guardar', mensajeCompleto);
    } finally {
      setCargando(false);
    }
  };

  const alternarCurso = (cursoId: string) => {
    setCursosSeleccionados((seleccionados) =>
      seleccionados.includes(cursoId)
        ? seleccionados.filter((id) => id !== cursoId)
        : [...seleccionados, cursoId],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Registrar Nuevo Estudiante</Text>
      <Text style={styles.subtitulo}>
      Lee una tarjeta NFC nueva y asocia al estudiante a tus cursos.
      </Text>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Nombres:</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Karen Jacqueline"
          placeholderTextColor="#a4b0be"
          value={nombres}
          onChangeText={setNombres}
          editable={!cargando}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Apellidos:</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Calderón Basurto"
          placeholderTextColor="#a4b0be"
          value={apellidos}
          onChangeText={setApellidos}
          editable={!cargando}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Cédula:</Text>
        <TextInput
          style={styles.input}
          placeholder="Número de cédula"
          placeholderTextColor="#a4b0be"
          value={cedula}
          onChangeText={setCedula}
          editable={!cargando}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Número de lista:</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 4"
          placeholderTextColor="#a4b0be"
          value={numeroLista}
          onChangeText={setNumeroLista}
          editable={!cargando}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Cursos del estudiante:</Text>
        {cargandoCursos ? (
          <ActivityIndicator color="#00a8ff" style={styles.cargandoCursos} />
        ) : cursos.length === 0 ? (
          <Text style={styles.avisoCursos}>No tienes cursos. Crea un curso antes de registrar estudiantes.</Text>
        ) : (
          <View style={styles.listaCursos}>
            {cursos.map((curso) => {
              const seleccionado = cursosSeleccionados.includes(curso.id);
              return (
                <TouchableOpacity
                  key={curso.id}
                  style={[styles.curso, seleccionado && styles.cursoSeleccionado]}
                  onPress={() => alternarCurso(curso.id)}
                  disabled={cargando}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: seleccionado }}
                >
                  <Text style={[styles.check, seleccionado && styles.checkSeleccionado]}>
                    {seleccionado ? '✓' : '○'}
                  </Text>
                  <Text style={styles.textoCurso}>
                    {curso.cursoIdCustom} · {curso.materia}
                    {curso.nivel ? ` · ${curso.nivel}` : ''}
                    {curso.paralelo ? ` · ${curso.paralelo}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>Código de tarjeta NFC:</Text>
        <View style={styles.uidContainer}>
          <Text style={uidTarjeta ? styles.uidLeido : styles.uidPendiente}>
            {uidTarjeta || 'Aún no se ha leído la tarjeta'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={leerTarjeta}
          disabled={cargando}
        >
          <Text style={styles.textoBotonSecundario}>Leer tarjeta NFC</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Fotografía:</Text>
        {imagen ? (
          <Image source={{ uri: imagen.uri }} style={styles.vistaPrevia} />
        ) : (
          <View style={[styles.vistaPrevia, styles.sinImagen]}>
            <Text style={styles.textoSinImagen}>Vista previa de la fotografía</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={() => seleccionarImagen('camara')}
          disabled={cargando}
        >
          <Text style={styles.textoBotonSecundario}>Tomar Fotografía</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={() => seleccionarImagen('galeria')}
          disabled={cargando}
        >
          <Text style={styles.textoBotonSecundario}>Elegir de la Galería</Text>
        </TouchableOpacity>

        {cargando ? (
          <View style={styles.estadoCarga}>
            <ActivityIndicator size="large" color="#00a8ff" />
            <Text style={styles.textoCarga}>Procesando solicitud...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.boton} onPress={guardarEstudiante}>
            <Text style={styles.textoBoton}>Guardar Estudiante</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 25, backgroundColor: '#f5f6fa' },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#2f3640', marginBottom: 5, textAlign: 'center' },
  subtitulo: { fontSize: 14, color: '#718093', marginBottom: 30, textAlign: 'center' },
  formContainer: { width: '100%' },
  label: { fontSize: 16, fontWeight: '600', color: '#2f3640', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dcdde1',
    fontSize: 16,
    marginBottom: 18,
  },
  vistaPrevia: { width: 180, height: 180, alignSelf: 'center', borderRadius: 12, marginBottom: 20 },
  sinImagen: { backgroundColor: '#dcdde1', justifyContent: 'center', alignItems: 'center' },
  textoSinImagen: { color: '#718093', textAlign: 'center' },
  cargandoCursos: { marginBottom: 18 },
  avisoCursos: { color: '#d63031', marginBottom: 18 },
  listaCursos: { gap: 8, marginBottom: 18 },
  curso: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dcdde1',
    backgroundColor: '#fff',
  },
  cursoSeleccionado: { borderColor: '#00a8ff', backgroundColor: '#eaf7ff' },
  check: { fontSize: 20, color: '#718093', marginRight: 10 },
  checkSeleccionado: { color: '#00a8ff', fontWeight: 'bold' },
  textoCurso: { flex: 1, color: '#2f3640' },
  uidContainer: {
    minHeight: 48,
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#dcdde1',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  uidLeido: { color: '#2f3640', fontWeight: '600', fontSize: 15 },
  uidPendiente: { color: '#8b95a1', fontSize: 15 },
  boton: {
    backgroundColor: '#4cd137',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  botonSecundario: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#00a8ff' },
  textoBoton: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  textoBotonSecundario: { color: '#00a8ff', fontSize: 16, fontWeight: 'bold' },
  estadoCarga: { alignItems: 'center', marginTop: 20 },
  textoCarga: { color: '#57606f', marginTop: 8 },
});
