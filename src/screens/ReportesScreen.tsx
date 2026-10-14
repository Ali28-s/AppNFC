import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Curso } from './CursosScreen';
import { db } from '../services/firebaseConfig';
import { useDocenteAuth } from '../services/docenteAuth';

interface AsistenciaItem {
  id: string;
  uid: string;
  estudiante: string;
  cursoId: string;
  cursoDocId: string;
  materia: string;
  fecha: string;
  hora: string;
  horaBloque: string;
}

interface EstudianteFiltro {
  uid: string;
  nombre: string;
}

function normalizarFecha(valor: unknown): string {
  if (typeof valor === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);
    const fechaLegada = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fechaLegada) {
      return `${fechaLegada[3]}-${fechaLegada[2].padStart(2, '0')}-${fechaLegada[1].padStart(2, '0')}`;
    }
    return '';
  }
  if (valor && typeof valor === 'object' && 'toDate' in valor) {
    const fecha = (valor as { toDate: () => Date }).toDate();
    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1).padStart(2, '0'),
      String(fecha.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return '';
}

function fechaEsValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return (
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === dia
  );
}

export default function ReportesScreen() {
  const { docente } = useDocenteAuth();
  const [asistencias, setAsistencias] = useState<AsistenciaItem[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteFiltro[]>([]);
  const [cursoId, setCursoId] = useState('');
  const [estudianteUid, setEstudianteUid] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let activa = true;

    const cargarDatos = async () => {
      if (!docente?.profesorId) {
        setCargando(false);
        return;
      }

      try {
        const [resultadoAsistencias, resultadoCursos] = await Promise.all([
          getDocs(
            query(collection(db, 'asistencias'), where('profesorId', '==', docente.profesorId)),
          ),
          getDocs(query(collection(db, 'cursos'), where('profesorId', '==', docente.profesorId))),
        ]);

        const listaAsistencias: AsistenciaItem[] = resultadoAsistencias.docs.map((documento) => {
          const datos = documento.data();
          const hora =
            typeof datos.hora === 'string'
              ? datos.hora
              : datos.hora && typeof datos.hora.toDate === 'function'
                ? datos.hora.toDate().toTimeString().slice(0, 8)
                : '';

          return {
            id: documento.id,
            uid: typeof datos.uid === 'string' ? datos.uid : '',
            estudiante:
              typeof datos.estudiante === 'string'
                ? datos.estudiante
                : typeof datos.nombreEstudiante === 'string'
                  ? datos.nombreEstudiante
                  : 'Estudiante sin nombre',
            cursoId: typeof datos.cursoId === 'string' ? datos.cursoId : '',
            cursoDocId: typeof datos.cursoDocId === 'string' ? datos.cursoDocId : '',
            materia: typeof datos.materia === 'string' ? datos.materia : '',
            fecha: normalizarFecha(datos.fecha),
            hora,
            horaBloque:
              typeof datos.horaBloque === 'string'
                ? datos.horaBloque
                : hora.slice(0, 2),
          };
        });
        listaAsistencias.sort((a, b) =>
          `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`),
        );

        const listaCursos: Curso[] = resultadoCursos.docs.map((documento) => {
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

        if (activa) {
          setAsistencias(listaAsistencias);
          setCursos(listaCursos);
        }
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error('Error al cargar reportes:', error);
        if (activa) Alert.alert('Error al cargar reportes', mensaje);
      } finally {
        if (activa) setCargando(false);
      }
    };

    void cargarDatos();
    return () => {
      activa = false;
    };
  }, [docente?.profesorId]);

  useEffect(() => {
    let activa = true;
    if (!cursoId) return;

    const cargarEstudiantes = async () => {
      setCargandoEstudiantes(true);
      try {
        const resultado = await getDocs(
          query(collection(db, 'usuarios'), where('cursoIds', 'array-contains', cursoId)),
        );
        const lista = resultado.docs
          .map((documento): EstudianteFiltro => {
            const datos = documento.data();
            return {
              uid: typeof datos.uid === 'string' ? datos.uid : documento.id,
              nombre: `${typeof datos.nombres === 'string' ? datos.nombres : ''} ${typeof datos.apellidos === 'string' ? datos.apellidos : ''}`.trim() || 'Estudiante sin nombre',
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        if (activa) setEstudiantes(lista);
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error('No se pudieron cargar estudiantes para el filtro:', error);
        if (activa) Alert.alert('Error al cargar estudiantes', mensaje);
      } finally {
        if (activa) setCargandoEstudiantes(false);
      }
    };

    void cargarEstudiantes();
    return () => {
      activa = false;
    };
  }, [cursoId]);

  const cursoSeleccionado = cursos.find((curso) => curso.id === cursoId);
  const asistenciasFiltradas = useMemo(() => {
    return asistencias.filter((item) => {
      const coincideCurso =
        !cursoSeleccionado ||
        item.cursoDocId === cursoSeleccionado.id ||
        (!item.cursoDocId &&
          (item.cursoId === cursoSeleccionado.codigo || item.cursoId === cursoSeleccionado.id));
      const coincideEstudiante = !estudianteUid || item.uid === estudianteUid;
      const coincideFecha =
        (!fechaDesde || item.fecha >= fechaDesde) &&
        (!fechaHasta || item.fecha <= fechaHasta);
      const hora = Number.parseInt(item.horaBloque || item.hora.slice(0, 2), 10);
      const coincideHora =
        (!horaDesde || hora >= Number.parseInt(horaDesde, 10)) &&
        (!horaHasta || hora <= Number.parseInt(horaHasta, 10));
      return coincideCurso && coincideEstudiante && coincideFecha && coincideHora;
    });
  }, [
    asistencias,
    cursoSeleccionado,
    estudianteUid,
    fechaDesde,
    fechaHasta,
    horaDesde,
    horaHasta,
  ]);

  const seleccionarCurso = (id: string) => {
    setCursoId(id);
    setEstudianteUid('');
  };

  const cambiarHora = (
    valor: string,
    setValor: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const digitos = valor.replace(/\D/g, '').slice(0, 2);
    if (digitos && Number(digitos) > 23) {
      Alert.alert('Hora inválida', 'Ingresa una hora entre 00 y 23.');
      return;
    }
    setValor(digitos);
  };

  const exportarExcel = async () => {
    if (fechaDesde && !fechaEsValida(fechaDesde)) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD para la fecha inicial.');
      return;
    }
    if (fechaHasta && !fechaEsValida(fechaHasta)) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD para la fecha final.');
      return;
    }
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      Alert.alert('Rango de fechas inválido', 'La fecha inicial debe ser anterior o igual a la final.');
      return;
    }
    if (horaDesde && horaHasta && Number(horaDesde) > Number(horaHasta)) {
      Alert.alert('Rango de horas inválido', 'La hora inicial debe ser anterior o igual a la final.');
      return;
    }

    const directorio = FileSystem.documentDirectory;
    if (!directorio) {
      Alert.alert('No se pudo exportar', 'El almacenamiento de documentos no está disponible.');
      return;
    }

    setExportando(true);
    try {
      const filas: (string | number)[][] = [
        ['Estudiante', 'UID NFC', 'Curso', 'Código del curso', 'Fecha', 'Hora', 'Turno'],
        ...asistenciasFiltradas.map((item) => [
          item.estudiante,
          item.uid,
          item.materia,
          item.cursoId,
          item.fecha,
          item.hora,
          item.horaBloque,
        ]),
      ];
      const libro = XLSX.utils.book_new();
      const hoja = XLSX.utils.aoa_to_sheet(filas);
      XLSX.utils.book_append_sheet(libro, hoja, 'Asistencias');
      const contenido = XLSX.write(libro, { bookType: 'xlsx', type: 'base64' });
      const uri = `${directorio}asistencias_${Date.now()}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, contenido, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Exportar asistencias a Excel',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        Alert.alert('Excel generado', `El archivo quedó guardado en:\n${uri}`);
      }
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      console.error('No se pudo exportar el reporte a Excel:', error);
      Alert.alert('No se pudo exportar el reporte', mensaje);
    } finally {
      setExportando(false);
    }
  };

  const chipCurso = (id: string, etiqueta: string) => (
    <TouchableOpacity
      key={id || 'todos'}
      style={[styles.chip, cursoId === id && styles.chipActivo]}
      onPress={() => seleccionarCurso(id)}
    >
      <Text style={[styles.textoChip, cursoId === id && styles.textoChipActivo]}>{etiqueta}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Reportes de Asistencia</Text>
      <Text style={styles.subtitulo}>Aplica los filtros en orden: curso, estudiante y periodo.</Text>

      {cargando ? (
        <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
      ) : (
        <FlatList
          data={asistenciasFiltradas}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              <Text style={styles.etiqueta}>1. Curso / materia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                {chipCurso('', 'Todos')}
                {cursos.map((curso) => chipCurso(curso.id, `${curso.codigo} · ${curso.materia}`))}
              </ScrollView>

              {cursoId ? (
                <>
                  <Text style={styles.etiqueta}>2. Estudiante (opcional)</Text>
                  {cargandoEstudiantes ? (
                    <ActivityIndicator color="#00a8ff" style={styles.cargaEstudiantes} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
                      <TouchableOpacity
                        style={[styles.chip, !estudianteUid && styles.chipActivo]}
                        onPress={() => setEstudianteUid('')}
                      >
                        <Text style={[styles.textoChip, !estudianteUid && styles.textoChipActivo]}>
                          Todos
                        </Text>
                      </TouchableOpacity>
                      {estudiantes.map((estudiante) => (
                        <TouchableOpacity
                          key={estudiante.uid}
                          style={[
                            styles.chip,
                            estudianteUid === estudiante.uid && styles.chipActivo,
                          ]}
                          onPress={() => setEstudianteUid(estudiante.uid)}
                        >
                          <Text
                            style={[
                              styles.textoChip,
                              estudianteUid === estudiante.uid && styles.textoChipActivo,
                            ]}
                          >
                            {estudiante.nombre}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              ) : null}

              <Text style={styles.etiqueta}>3. Rango de fechas (AAAA-MM-DD)</Text>
              <View style={styles.filaFiltros}>
                <TextInput
                  style={styles.inputFiltro}
                  placeholder="Desde"
                  value={fechaDesde}
                  onChangeText={setFechaDesde}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
                <TextInput
                  style={styles.inputFiltro}
                  placeholder="Hasta"
                  value={fechaHasta}
                  onChangeText={setFechaHasta}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>

              <Text style={styles.etiqueta}>4. Rango de horas (opcional, 00–23)</Text>
              <View style={styles.filaFiltros}>
                <TextInput
                  style={styles.inputFiltro}
                  placeholder="Hora desde"
                  value={horaDesde}
                  onChangeText={(valor) => cambiarHora(valor, setHoraDesde)}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <TextInput
                  style={styles.inputFiltro}
                  placeholder="Hora hasta"
                  value={horaHasta}
                  onChangeText={(valor) => cambiarHora(valor, setHoraHasta)}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <Text style={styles.resultados}>
                {asistenciasFiltradas.length} registro(s) con los filtros actuales
              </Text>
              <TouchableOpacity
                style={[styles.botonExportar, exportando && styles.botonDeshabilitado]}
                onPress={() => void exportarExcel()}
                disabled={exportando}
              >
                {exportando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.textoBotonExportar}>Exportar a Excel (.xlsx)</Text>
                )}
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.nombreEstudiante}>👤 {item.estudiante}</Text>
              {item.materia ? <Text style={styles.detalle}>{item.materia}</Text> : null}
              {item.cursoId ? <Text style={styles.detalle}>Curso: {item.cursoId}</Text> : null}
              <Text style={styles.fechaRegistro}>
                🕒 {item.fecha || 'Fecha no disponible'}{item.hora ? ` · ${item.hora}` : ''}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.textoVacio}>
              No hay asistencias que coincidan con los filtros seleccionados.
            </Text>
          }
          contentContainerStyle={styles.listContainer}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#f5f6fa' },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#2f3640', textAlign: 'center', marginTop: 5 },
  subtitulo: { fontSize: 14, color: '#718093', textAlign: 'center', marginTop: 5, marginBottom: 12 },
  loader: { marginTop: 40 },
  listContainer: { paddingBottom: 20 },
  etiqueta: { color: '#2f3640', fontSize: 15, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  chips: { flexGrow: 0, marginBottom: 3 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#fff', borderColor: '#dcdde1', borderWidth: 1, marginRight: 7 },
  chipActivo: { backgroundColor: '#eaf7ff', borderColor: '#00a8ff' },
  textoChip: { color: '#57606f', fontSize: 13 },
  textoChipActivo: { color: '#0077b6', fontWeight: 'bold' },
  cargaEstudiantes: { alignSelf: 'flex-start', margin: 8 },
  filaFiltros: { flexDirection: 'row', gap: 10 },
  inputFiltro: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dcdde1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: '#2f3640' },
  resultados: { color: '#718093', marginTop: 10, marginBottom: 4 },
  botonExportar: { backgroundColor: '#218c54', padding: 13, borderRadius: 10, alignItems: 'center', marginBottom: 14 },
  botonDeshabilitado: { opacity: 0.7 },
  textoBotonExportar: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 2 },
  nombreEstudiante: { fontSize: 18, fontWeight: 'bold', color: '#2f3640', marginBottom: 6 },
  detalle: { fontSize: 14, color: '#57606f', marginBottom: 4 },
  fechaRegistro: { fontSize: 14, color: '#718093', marginTop: 4 },
  textoVacio: { textAlign: 'center', color: '#718093', marginTop: 20, marginBottom: 25, fontSize: 16 },
});
