import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { leerUidTarjetaNfc, normalizarUidNfc } from '../services/nfcService';
import { db } from '../services/firebaseConfig';
import { useDocenteAuth } from '../services/docenteAuth';

interface Curso {
  id: string;
  cursoId: string;
  materia: string;
  nivel: string;
  paralelo: string;
}

interface UsuarioEstudiante {
  uid: string;
  nombres: string;
  apellidos: string;
  fotoUrl: string | null;
}

interface EscaneoPendiente {
  uid: string;
  fecha: string;
  hora: string;
  horaBloque: string;
  fotoUrl: string | null;
}

type HoraEscaneo = Pick<EscaneoPendiente, 'fecha' | 'hora' | 'horaBloque'>;

function fechaHoraEscaneo(ahora: Date): HoraEscaneo {
  const fecha = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');
  const hora = [
    String(ahora.getHours()).padStart(2, '0'),
    String(ahora.getMinutes()).padStart(2, '0'),
    String(ahora.getSeconds()).padStart(2, '0'),
  ].join(':');
  return { fecha, hora, horaBloque: String(ahora.getHours()).padStart(2, '0') };
}

export default function LectorScreen() {
  const { docente } = useDocenteAuth();
  const [info, setInfo] = useState('Selecciona un curso y acerca la tarjeta del estudiante.');
  const [nombreEstudiante, setNombreEstudiante] = useState<string | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoCursos, setCargandoCursos] = useState(true);
  const [nfcPreparado, setNfcPreparado] = useState(false);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<Curso | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [inscripcionAbierta, setInscripcionAbierta] = useState(false);
  const [escaneoPendiente, setEscaneoPendiente] = useState<EscaneoPendiente | null>(null);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [cedula, setCedula] = useState('');
  const [numeroLista, setNumeroLista] = useState('');

  useEffect(() => {
    let activa = true;

    NfcManager.start()
      .then(() => {
        if (activa) setNfcPreparado(true);
      })
      .catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : String(error);
        if (activa) {
          setInfo('No se pudo inicializar NFC en este dispositivo.');
          Alert.alert('Error de NFC', mensaje);
        }
      });

    return () => {
      activa = false;
    };
  }, []);

  useEffect(() => {
    let activa = true;

    const cargarCursos = async () => {
      try {
        const resultado = await getDocs(
          query(collection(db, 'cursos'), where('profesorId', '==', docente?.profesorId)),
        );
        const lista = resultado.docs.map((documento) => {
          const datos = documento.data();
          return {
            id: documento.id,
            cursoId:
              typeof datos.cursoIdCustom === 'string' && datos.cursoIdCustom.trim()
                ? datos.cursoIdCustom.trim()
                : documento.id,
            materia: typeof datos.materia === 'string' ? datos.materia : 'Materia sin nombre',
            nivel: typeof datos.nivel === 'string' ? datos.nivel : '',
            paralelo: typeof datos.paralelo === 'string' ? datos.paralelo : '',
          };
        });

        if (activa) {
          setCursos(lista);
          if (lista.length === 1) {
            setCursoSeleccionado(lista[0]);
          }
        }
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error('No se pudieron cargar los cursos del docente:', error);
        if (activa) {
          setInfo('No se pudieron cargar los cursos asignados.');
          Alert.alert('Error al cargar cursos', mensaje);
        }
      } finally {
        if (activa) setCargandoCursos(false);
      }
    };

    if (docente?.profesorId) void cargarCursos();

    return () => {
      activa = false;
    };
  }, [docente?.profesorId]);

  const registrarAsistencia = async (
    estudiante: UsuarioEstudiante,
    escaneo: HoraEscaneo,
  ) => {
    if (!docente || !cursoSeleccionado) {
      throw new Error('Selecciona uno de tus cursos antes de registrar asistencia.');
    }

    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`.trim();
    const asistenciaId = [
      cursoSeleccionado.id,
      estudiante.uid,
      escaneo.fecha,
      escaneo.horaBloque,
    ].join('_');
    const asistenciaRef = doc(db, 'asistencias', asistenciaId);
    const existentesEseDia = await getDocs(
      query(
        collection(db, 'asistencias'),
        where('cursoId', '==', cursoSeleccionado.cursoId),
        where('uid', '==', estudiante.uid),
        where('fecha', '==', escaneo.fecha),
      ),
    );
    const asistenciaDeLaHora = existentesEseDia.docs.some((documento) => {
      const datos = documento.data();
      return (
        datos.profesorId === docente.profesorId &&
        (datos.horaBloque === escaneo.horaBloque ||
          (typeof datos.hora === 'string' && datos.hora.slice(0, 2) === escaneo.horaBloque))
      );
    });
    if (asistenciaDeLaHora) {
      throw new Error(
        `La asistencia de ${nombreCompleto} para esta materia ya fue registrada durante la hora ${escaneo.horaBloque}:00.`,
      );
    }

    await runTransaction(db, async (transaccion) => {
      const existente = await transaccion.get(asistenciaRef);
      if (existente.exists()) {
        throw new Error(
          `La asistencia de ${nombreCompleto} para esta materia ya fue registrada durante la hora ${escaneo.horaBloque}:00.`,
        );
      }
      transaccion.set(asistenciaRef, {
        cursoId: cursoSeleccionado.cursoId,
        cursoDocId: cursoSeleccionado.id,
        estudiante: nombreCompleto,
        fecha: escaneo.fecha,
        hora: escaneo.hora,
        horaBloque: escaneo.horaBloque,
        materia: cursoSeleccionado.materia,
        profesorId: docente.profesorId,
        uid: estudiante.uid,
      });
    });

    setNombreEstudiante(nombreCompleto);
    setImagenUrl(estudiante.fotoUrl);
    setInfo('¡Asistencia registrada correctamente!');
    Alert.alert('Éxito', `Asistencia registrada para ${nombreCompleto} a las ${escaneo.hora}.`);
  };

  const procesarUidEscaneado = async (uidTarjeta: string, momentoEscaneo: Date) => {
    if (!cursoSeleccionado) {
      throw new Error('Selecciona uno de tus cursos antes de leer una tarjeta.');
    }
    const uid = normalizarUidNfc(uidTarjeta);
    const coincidencias = await getDocs(
      query(collection(db, 'usuarios'), where('uid', '==', uid)),
    );
    if (coincidencias.size > 1) {
      throw new Error('Este UID NFC está asignado a varios estudiantes. Corrige los datos en usuarios.');
    }

    let documentoEstudiante = coincidencias.docs[0] ?? null;
    if (!documentoEstudiante) {
      const documentoPorUid = await getDoc(doc(db, 'usuarios', uid));
      if (documentoPorUid.exists()) {
        documentoEstudiante = documentoPorUid;
      }
    }

    const datos = documentoEstudiante?.data() ?? {};
    const cursosInscritos = Array.isArray(datos.cursoIds) ? datos.cursoIds : [];
    const horaEscaneo = fechaHoraEscaneo(momentoEscaneo);
    if (documentoEstudiante && cursosInscritos.includes(cursoSeleccionado.id)) {
      const nombresEstudiante =
        typeof datos.nombres === 'string' ? datos.nombres.trim() : '';
      const apellidosEstudiante =
        typeof datos.apellidos === 'string' ? datos.apellidos.trim() : '';
      if (!nombresEstudiante || !apellidosEstudiante) {
        throw new Error('El perfil del estudiante no tiene nombres y apellidos completos.');
      }
      await registrarAsistencia(
        {
          uid,
          nombres: nombresEstudiante,
          apellidos: apellidosEstudiante,
          fotoUrl:
            typeof datos.fotoUrl === 'string' && datos.fotoUrl.trim() ? datos.fotoUrl : null,
        },
        horaEscaneo,
      );
      return;
    }

    setEscaneoPendiente({
      uid,
      ...horaEscaneo,
      fotoUrl:
        typeof datos.fotoUrl === 'string' && datos.fotoUrl.trim() ? datos.fotoUrl : null,
    });
    setNombres(typeof datos.nombres === 'string' ? datos.nombres : '');
    setApellidos(typeof datos.apellidos === 'string' ? datos.apellidos : '');
    setCedula(typeof datos.cedula === 'string' ? datos.cedula : '');
    setNumeroLista(
      typeof datos.numeroLista === 'number' ? String(datos.numeroLista) : '',
    );
    setInfo('Completa los datos para inscribir al estudiante en esta materia.');
    setInscripcionAbierta(true);
  };

  const guardarInscripcionYAsistencia = async () => {
    if (!docente || !cursoSeleccionado || !escaneoPendiente) {
      Alert.alert('No se pudo continuar', 'Vuelve a escanear la tarjeta y selecciona un curso.');
      return;
    }
    const datos = {
      nombres: nombres.trim(),
      apellidos: apellidos.trim(),
      cedula: cedula.trim(),
      numeroLista: Number(numeroLista),
    };
    if (!datos.nombres || !datos.apellidos || !datos.cedula || !numeroLista.trim()) {
      Alert.alert('Datos incompletos', 'Completa nombres, apellidos, cédula y número de lista.');
      return;
    }
    if (!Number.isInteger(datos.numeroLista) || datos.numeroLista < 0) {
      Alert.alert('Número de lista inválido', 'Ingresa un número de lista entero igual o mayor a 0.');
      return;
    }

    let inscripcionGuardada = false;
    setCargando(true);
    try {
      const [porUid, porCedula] = await Promise.all([
        getDocs(query(collection(db, 'usuarios'), where('uid', '==', escaneoPendiente.uid))),
        getDocs(query(collection(db, 'usuarios'), where('cedula', '==', datos.cedula))),
      ]);
      if (porUid.size > 1 || porCedula.size > 1) {
        throw new Error('Hay registros duplicados para este UID o cédula. Corrige usuarios en Firestore.');
      }
      const existentePorUid = porUid.docs[0] ?? null;
      const existentePorCedula = porCedula.docs[0] ?? null;
      if (
        existentePorCedula &&
        existentePorUid &&
        existentePorCedula.id !== existentePorUid.id
      ) {
        throw new Error('La cédula ingresada ya pertenece a otro estudiante.');
      }
      if (
        existentePorCedula &&
        !existentePorUid &&
        existentePorCedula.data().uid &&
        normalizarUidNfc(String(existentePorCedula.data().uid)) !== escaneoPendiente.uid
      ) {
        throw new Error('La cédula ingresada ya está asociada a otra tarjeta NFC.');
      }

      const usuarioRef = existentePorUid?.ref
        ?? existentePorCedula?.ref
        ?? doc(db, 'usuarios', escaneoPendiente.uid);
      await setDoc(
        usuarioRef,
        {
          ...datos,
          uid: escaneoPendiente.uid,
          cursoIds: arrayUnion(cursoSeleccionado.id),
        },
        { merge: true },
      );
      inscripcionGuardada = true;
      setInscripcionAbierta(false);
      await registrarAsistencia(
        {
          uid: escaneoPendiente.uid,
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          fotoUrl: escaneoPendiente.fotoUrl,
        },
        escaneoPendiente,
      );
      setEscaneoPendiente(null);
      setNombres('');
      setApellidos('');
      setCedula('');
      setNumeroLista('');
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      setInfo(inscripcionGuardada
        ? 'El estudiante quedó inscrito, pero no se pudo guardar la asistencia.'
        : 'No se pudo inscribir al estudiante ni guardar la asistencia.');
      Alert.alert(
        inscripcionGuardada ? 'Inscripción guardada; asistencia pendiente' : 'No se pudo completar el registro',
        mensaje,
      );
    } finally {
      setCargando(false);
    }
  };

  const handleEscanear = async () => {
    if (cargando || !nfcPreparado || !cursoSeleccionado) {
      if (!cursoSeleccionado) {
        Alert.alert('Selecciona un curso', 'Elige uno de tus cursos antes de leer una tarjeta.');
      }
      return;
    }

    try {
      const nfcHabilitado = await NfcManager.isEnabled();
      if (!nfcHabilitado) {
        Alert.alert(
          'NFC desactivado',
          'Activa NFC en los ajustes del sistema para poder leer la tarjeta del estudiante.',
        );
        return;
      }
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      Alert.alert('No se pudo comprobar NFC', mensaje);
      return;
    }

    setInfo('Acerca la tarjeta al dispositivo...');
    setNombreEstudiante(null);
    setImagenUrl(null);
    setCargando(true);

    try {
      const uid = await leerUidTarjetaNfc();
      const momentoEscaneo = new Date();
      await procesarUidEscaneado(uid, momentoEscaneo);
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      setInfo('No se pudo procesar el escaneo.');
      Alert.alert('Error al registrar asistencia', mensaje);
    } finally {
      setCargando(false);
    }
  };

  const textoCurso = (curso: Curso) =>
    [curso.cursoId, curso.materia, curso.nivel, curso.paralelo && `Paralelo ${curso.paralelo}`]
      .filter(Boolean)
      .join(' · ');

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Registro de Asistencia NFC</Text>

      <TouchableOpacity
        style={styles.selectorCurso}
        onPress={() => setSelectorAbierto(true)}
        disabled={cargandoCursos || cargando || cursos.length === 0}
      >
        {cargandoCursos ? (
          <ActivityIndicator color="#00a8ff" />
        ) : (
          <Text style={cursoSeleccionado ? styles.textoCurso : styles.textoSelector}>
            {cursoSeleccionado
              ? textoCurso(cursoSeleccionado)
              : cursos.length
                ? 'Selecciona uno de tus cursos'
                : 'No tienes cursos asignados'}
          </Text>
        )}
      </TouchableOpacity>

      {cursos.length === 0 && !cargandoCursos ? (
        <Text style={styles.aviso}>No hay cursos registrados con tu profesorId.</Text>
      ) : null}

      <View style={styles.cardContainer}>
        {cargando ? (
          <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
        ) : imagenUrl ? (
          <Image source={{ uri: imagenUrl }} style={styles.imagenEstudiante} />
        ) : (
          <View style={styles.placeholderImagen}>
            <Text style={styles.textoPlaceholder}>Sin foto registrada</Text>
          </View>
        )}

        {nombreEstudiante ? <Text style={styles.nombreText}>{nombreEstudiante}</Text> : null}
        <Text style={styles.textoInfo}>{info}</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.botonEscanear,
          (!nfcPreparado || cargando || !cursoSeleccionado) && styles.botonDeshabilitado,
        ]}
        onPress={handleEscanear}
        disabled={!nfcPreparado || cargando || !cursoSeleccionado}
      >
        <Text style={styles.textoBoton}>
          {nfcPreparado ? 'Escanear Tarjeta NFC' : 'Preparando NFC...'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={selectorAbierto}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectorAbierto(false)}
      >
        <View style={styles.fondoModal}>
          <View style={styles.modal}>
            <Text style={styles.tituloModal}>Selecciona un curso</Text>
            <ScrollView>
              {cursos.map((curso) => (
                <TouchableOpacity
                  key={curso.id}
                  style={styles.opcionCurso}
                  onPress={() => {
                    setCursoSeleccionado(curso);
                    setSelectorAbierto(false);
                  }}
                >
                  <Text style={styles.textoOpcion}>{textoCurso(curso)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setSelectorAbierto(false)}>
              <Text style={styles.cancelarModal}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={inscripcionAbierta}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setInscripcionAbierta(false);
          setEscaneoPendiente(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.fondoModal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalInscripcion}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.contenidoInscripcion}
            >
              <Text style={styles.tituloModal}>Inscribir estudiante</Text>
              <Text style={styles.descripcionModal}>
                Esta tarjeta aún no está en {cursoSeleccionado?.materia}. Ingresa sus datos para
                agregarlo al curso y guardar su asistencia.
              </Text>
              <Text style={styles.label}>UID de la tarjeta NFC</Text>
              <Text style={styles.uidPendiente}>{escaneoPendiente?.uid}</Text>
              <Text style={styles.label}>Nombres</Text>
              <TextInput
                style={styles.input}
                value={nombres}
                onChangeText={setNombres}
                placeholder="Nombres"
                editable={!cargando}
                autoCapitalize="words"
              />
              <Text style={styles.label}>Apellidos</Text>
              <TextInput
                style={styles.input}
                value={apellidos}
                onChangeText={setApellidos}
                placeholder="Apellidos"
                editable={!cargando}
                autoCapitalize="words"
              />
              <Text style={styles.label}>Cédula</Text>
              <TextInput
                style={styles.input}
                value={cedula}
                onChangeText={setCedula}
                placeholder="Número de cédula"
                editable={!cargando}
                keyboardType="number-pad"
              />
              <Text style={styles.label}>Número de lista</Text>
              <TextInput
                style={styles.input}
                value={numeroLista}
                onChangeText={setNumeroLista}
                placeholder="Número de lista"
                editable={!cargando}
                keyboardType="number-pad"
              />
              {cargando ? (
                <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
              ) : (
                <TouchableOpacity
                  style={styles.botonGuardarInscripcion}
                  onPress={guardarInscripcionYAsistencia}
                >
                  <Text style={styles.textoBoton}>Inscribir y marcar asistencia</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setInscripcionAbierta(false);
                  setEscaneoPendiente(null);
                }}
                disabled={cargando}
              >
                <Text style={styles.cancelarModal}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', backgroundColor: '#f5f6fa' },
  titulo: { fontSize: 22, fontWeight: 'bold', marginTop: 24, marginBottom: 20, color: '#2f3640' },
  selectorCurso: {
    minHeight: 54,
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderColor: '#dcdde1',
    borderWidth: 1,
    borderRadius: 10,
  },
  textoCurso: { color: '#2f3640', fontSize: 15, fontWeight: '600' },
  textoSelector: { color: '#718093', fontSize: 15 },
  aviso: { color: '#b42318', marginTop: 12, textAlign: 'center' },
  cardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  loader: { marginBottom: 20 },
  imagenEstudiante: {
    width: 180,
    height: 180,
    borderRadius: 90,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#4cd137',
  },
  placeholderImagen: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#dcdde1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    padding: 20,
  },
  textoPlaceholder: { color: '#718093', fontWeight: 'bold', textAlign: 'center' },
  textoInfo: { fontSize: 16, textAlign: 'center', color: '#57606f', marginVertical: 15 },
  nombreText: { fontSize: 20, fontWeight: 'bold', color: '#2f3640', textAlign: 'center' },
  botonEscanear: {
    backgroundColor: '#00a8ff',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  botonDeshabilitado: { opacity: 0.55 },
  textoBoton: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  fondoModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  modal: {
    maxHeight: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 22,
  },
  modalInscripcion: {
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  contenidoInscripcion: { paddingBottom: 12 },
  tituloModal: { color: '#2f3640', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  descripcionModal: { color: '#718093', fontSize: 14, marginBottom: 18 },
  label: { color: '#2f3640', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  uidPendiente: { color: '#57606f', marginBottom: 14, fontSize: 14 },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dcdde1',
    fontSize: 16,
    marginBottom: 14,
    color: '#2f3640',
  },
  botonGuardarInscripcion: {
    backgroundColor: '#00a8ff',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  opcionCurso: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#edf0f2' },
  textoOpcion: { color: '#2f3640', fontSize: 16 },
  cancelarModal: { color: '#0077b6', fontWeight: '600', textAlign: 'center', padding: 16 },
});
