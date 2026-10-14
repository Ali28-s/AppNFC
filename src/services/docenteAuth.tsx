import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { auth, db } from './firebaseConfig';

export interface DocenteProfile {
  uid: string;
  email: string;
  profesorId: string;
  nombre: string;
}

interface DocenteAuthContextValue {
  docente: DocenteProfile | null;
  cargando: boolean;
  errorAutenticacion: string | null;
  limpiarError: () => void;
  registrarDocente: (datos: DatosRegistroDocente) => Promise<void>;
}

export interface DatosRegistroDocente {
  nombre: string;
  apellidos: string;
  cedula: string;
  email: string;
  contrasena: string;
}

const DocenteAuthContext = createContext<DocenteAuthContextValue | null>(null);

async function buscarPerfilDocente(usuario: User): Promise<DocenteProfile | null> {
  const email = usuario.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const coincidencias = await getDocs(
    query(collection(db, 'profesores'), where('email', '==', email)),
  );
  if (coincidencias.size !== 1) {
    return null;
  }

  const documento = coincidencias.docs[0];
  const datos = documento.data();
  const profesorId = typeof datos.profesorId === 'string' ? datos.profesorId.trim() : '';
  if (!profesorId) {
    throw new Error('El perfil del docente no tiene el campo profesorId.');
  }

  const nombre = [datos.nombre, datos.apellidos]
    .filter((parte): parte is string => typeof parte === 'string' && parte.trim().length > 0)
    .map((parte) => parte.trim())
    .join(' ');

  return {
    uid: usuario.uid,
    email,
    profesorId,
    nombre: nombre || email,
  };
}

export function DocenteAuthProvider({ children }: React.PropsWithChildren) {
  const [docente, setDocente] = useState<DocenteProfile | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorAutenticacion, setErrorAutenticacion] = useState<string | null>(null);
  const registroEnCurso = useRef(false);

  useEffect(() => {
    let activa = true;

    const unsubscribe = onAuthStateChanged(auth, async (usuario) => {
      if (!activa) {
        return;
      }
      if (registroEnCurso.current && usuario) {
        return;
      }
      setCargando(true);

      if (!usuario) {
        setDocente(null);
        setCargando(false);
        return;
      }

      try {
        const perfil = await buscarPerfilDocente(usuario);
        if (!activa) {
          return;
        }

        if (!perfil) {
          setErrorAutenticacion(
            'Esta cuenta no está asociada a un docente registrado. Contacta al administrador.',
          );
          try {
            await signOut(auth);
          } catch (errorCierre: unknown) {
            const mensaje = errorCierre instanceof Error ? errorCierre.message : String(errorCierre);
            console.error('No se pudo cerrar la sesión sin perfil docente:', errorCierre);
            if (activa) {
              setErrorAutenticacion(
                `Esta cuenta no está asociada a un docente registrado y no se pudo cerrar la sesión: ${mensaje}`,
              );
            }
          }
          return;
        }

        setErrorAutenticacion(null);
        setDocente(perfil);
      } catch (error: unknown) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error('No se pudo validar el perfil del docente:', error);
        if (activa) {
          setErrorAutenticacion(`No se pudo validar el perfil docente: ${mensaje}`);
        }
        try {
          await signOut(auth);
        } catch (errorCierre: unknown) {
          const mensajeCierre =
            errorCierre instanceof Error ? errorCierre.message : String(errorCierre);
          console.error('No se pudo cerrar la sesión tras fallar la validación:', errorCierre);
          if (activa) {
            setErrorAutenticacion(
              `No se pudo validar el perfil docente: ${mensaje}. Tampoco se pudo cerrar la sesión: ${mensajeCierre}`,
            );
          }
        }
      } finally {
        if (activa) {
          setCargando(false);
        }
      }
    });

    return () => {
      activa = false;
      unsubscribe();
    };
  }, []);

  const registrarDocente = useCallback(async ({
    nombre,
    apellidos,
    cedula,
    email,
    contrasena,
  }: DatosRegistroDocente) => {
    const correo = email.trim().toLowerCase();
    const cedulaLimpia = cedula.trim();
    const nombreLimpio = nombre.trim();
    const apellidosLimpios = apellidos.trim();

    registroEnCurso.current = true;
    let usuarioCreado: User | null = null;
    try {
      const credencial = await createUserWithEmailAndPassword(auth, correo, contrasena);
      usuarioCreado = credencial.user;

      const profesorId = usuarioCreado.uid;
      const perfilRef = doc(db, 'profesores', profesorId);
      const perfil: DocenteProfile = {
        uid: usuarioCreado.uid,
        email: correo,
        profesorId,
        nombre: `${nombreLimpio} ${apellidosLimpios}`.trim(),
      };

      await setDoc(perfilRef, {
        nombre: nombreLimpio,
        apellidos: apellidosLimpios,
        cedula: cedulaLimpia,
        email: correo,
        profesorId,
        uid: usuarioCreado.uid,
      });
      setDocente(perfil);
      setErrorAutenticacion(null);
    } catch (error: unknown) {
      if (usuarioCreado) {
        try {
          await deleteUser(usuarioCreado);
        } catch (errorLimpieza: unknown) {
          const mensajeOriginal = error instanceof Error ? error.message : String(error);
          const mensajeLimpieza =
            errorLimpieza instanceof Error ? errorLimpieza.message : String(errorLimpieza);
          console.error('No se pudo eliminar la cuenta tras fallar el perfil docente:', errorLimpieza);
          try {
            await signOut(auth);
          } catch (errorCierre: unknown) {
            const mensajeCierre =
              errorCierre instanceof Error ? errorCierre.message : String(errorCierre);
            console.error('No se pudo cerrar la sesión tras fallar el registro:', errorCierre);
            throw new Error(
              `${mensajeOriginal} La cuenta Auth quedó creada, no se pudo limpiar: ${mensajeLimpieza}, y no se pudo cerrar la sesión: ${mensajeCierre}`,
            );
          }
          throw new Error(
            `${mensajeOriginal} La cuenta Auth quedó creada y no se pudo limpiar: ${mensajeLimpieza}`,
          );
        }
      }
      throw error;
    } finally {
      registroEnCurso.current = false;
    }
  }, []);

  const valor = useMemo(
    () => ({
      docente,
      cargando,
      errorAutenticacion,
      limpiarError: () => setErrorAutenticacion(null),
      registrarDocente,
    }),
    [docente, cargando, errorAutenticacion, registrarDocente],
  );

  if (cargando) {
    return (
      <View style={styles.carga}>
        <ActivityIndicator size="large" color="#00a8ff" />
        <Text style={styles.textoCarga}>Validando sesión docente...</Text>
      </View>
    );
  }

  return <DocenteAuthContext.Provider value={valor}>{children}</DocenteAuthContext.Provider>;
}

export function useDocenteAuth(): DocenteAuthContextValue {
  const context = useContext(DocenteAuthContext);
  if (!context) {
    throw new Error('useDocenteAuth debe usarse dentro de DocenteAuthProvider.');
  }
  return context;
}

const styles = StyleSheet.create({
  carga: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f6fa' },
  textoCarga: { marginTop: 12, color: '#57606f' },
});
