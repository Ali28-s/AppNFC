import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { useDocenteAuth } from '../services/docenteAuth';

function mensajeDeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'El correo electrónico no tiene un formato válido.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'El correo o la contraseña son incorrectos.';
      case 'auth/too-many-requests':
        return 'Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.';
      case 'auth/network-request-failed':
        return 'No se pudo conectar con Firebase. Comprueba tu conexión a internet.';
      case 'auth/email-already-in-use':
        return 'Ya existe una cuenta registrada con ese correo.';
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export default function LoginDocenteScreen() {
  const { errorAutenticacion, limpiarError, registrarDocente } = useDocenteAuth();
  const [modoRegistro, setModoRegistro] = useState(false);
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [cedula, setCedula] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [cargando, setCargando] = useState(false);

  const iniciarSesion = async () => {
    const correoLimpio = email.trim().toLowerCase();
    if (
      (modoRegistro && (!nombre.trim() || !apellidos.trim() || !cedula.trim())) ||
      !correoLimpio ||
      !contrasena
    ) {
      Alert.alert(
        'Datos incompletos',
        modoRegistro
          ? 'Completa nombres, apellidos, cédula, correo y contraseña.'
          : 'Ingresa tu correo y contraseña.',
      );
      return;
    }
    if (modoRegistro && contrasena.length < 6) {
      Alert.alert('Contraseña muy corta', 'Debe tener al menos 6 caracteres.');
      return;
    }
    if (modoRegistro && contrasena !== confirmarContrasena) {
      Alert.alert('Las contraseñas no coinciden', 'Vuelve a revisar la contraseña y su confirmación.');
      return;
    }

    setCargando(true);
    limpiarError();
    try {
      if (modoRegistro) {
        await registrarDocente({
          nombre,
          apellidos,
          cedula,
          email: correoLimpio,
          contrasena,
        });
        Alert.alert(
          'Cuenta creada',
          'Tu cuenta docente fue creada. Tu profesorId se generó automáticamente.',
        );
      } else {
        await signInWithEmailAndPassword(auth, correoLimpio, contrasena);
      }
    } catch (error: unknown) {
      Alert.alert(
        modoRegistro ? 'No se pudo crear la cuenta' : 'No se pudo iniciar sesión',
        mensajeDeError(error),
      );
    } finally {
      setCargando(false);
    }
  };

  const recuperarContrasena = async () => {
    const correoLimpio = email.trim().toLowerCase();
    if (!correoLimpio) {
      Alert.alert('Ingresa tu correo', 'Escribe tu correo para enviarte el enlace de recuperación.');
      return;
    }

    setCargando(true);
    try {
      await sendPasswordResetEmail(auth, correoLimpio);
      Alert.alert('Correo enviado', 'Revisa tu correo para restablecer la contraseña.');
    } catch (error: unknown) {
      Alert.alert('No se pudo enviar el correo', mensajeDeError(error));
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.formulario}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.icono}>
          <Text style={styles.iconoTexto}>NFC</Text>
        </View>
        <Text style={styles.titulo}>
          {modoRegistro ? 'Crear cuenta docente' : 'Acceso docente'}
        </Text>
        <Text style={styles.subtitulo}>
          {modoRegistro
            ? 'Regístrate para generar tu identificador docente y crear tus cursos.'
            : 'Inicia sesión con la cuenta docente registrada en el sistema.'}
        </Text>

        {errorAutenticacion ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errorAutenticacion}
          </Text>
        ) : null}

        {modoRegistro ? (
          <>
            <Text style={styles.label}>Nombres</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombres"
              placeholderTextColor="#8b95a1"
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              editable={!cargando}
            />
            <Text style={styles.label}>Apellidos</Text>
            <TextInput
              style={styles.input}
              placeholder="Apellidos"
              placeholderTextColor="#8b95a1"
              value={apellidos}
              onChangeText={setApellidos}
              autoCapitalize="words"
              editable={!cargando}
            />
            <Text style={styles.label}>Cédula</Text>
            <TextInput
              style={styles.input}
              placeholder="Número de cédula"
              placeholderTextColor="#8b95a1"
              value={cedula}
              onChangeText={setCedula}
              keyboardType="number-pad"
              editable={!cargando}
            />
          </>
        ) : null}

        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          placeholder="docente@ejemplo.com"
          placeholderTextColor="#8b95a1"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!cargando}
          returnKeyType="next"
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Ingresa tu contraseña"
          placeholderTextColor="#8b95a1"
          value={contrasena}
          onChangeText={setContrasena}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          editable={!cargando}
          onSubmitEditing={iniciarSesion}
          returnKeyType="done"
        />
        {modoRegistro ? (
          <>
            <Text style={styles.label}>Confirmar contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="Vuelve a escribir tu contraseña"
              placeholderTextColor="#8b95a1"
              value={confirmarContrasena}
              onChangeText={setConfirmarContrasena}
              autoCapitalize="none"
              secureTextEntry
              editable={!cargando}
              returnKeyType="done"
            />
          </>
        ) : null}

        {cargando ? (
          <ActivityIndicator size="large" color="#00a8ff" style={styles.loader} />
        ) : (
          <TouchableOpacity style={styles.boton} onPress={iniciarSesion}>
            <Text style={styles.textoBoton}>
              {modoRegistro ? 'Crear cuenta' : 'Iniciar sesión'}
            </Text>
          </TouchableOpacity>
        )}

        {!modoRegistro ? (
          <TouchableOpacity onPress={recuperarContrasena} disabled={cargando}>
            <Text style={styles.enlace}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => {
            setModoRegistro(!modoRegistro);
            limpiarError();
          }}
          disabled={cargando}
        >
          <Text style={styles.enlace}>
            {modoRegistro ? 'Ya tengo cuenta: iniciar sesión' : '¿Eres docente nuevo? Regístrate'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 25, backgroundColor: '#f5f6fa' },
  formulario: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingVertical: 28,
  },
  icono: {
    width: 76,
    height: 76,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00a8ff',
    borderRadius: 22,
    marginBottom: 24,
  },
  iconoTexto: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#2f3640', textAlign: 'center' },
  subtitulo: { fontSize: 15, color: '#718093', textAlign: 'center', marginTop: 8, marginBottom: 30 },
  error: {
    color: '#b42318',
    backgroundColor: '#fee4e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  label: { fontSize: 15, fontWeight: '600', color: '#2f3640', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dcdde1',
    fontSize: 16,
    marginBottom: 20,
    color: '#2f3640',
  },
  boton: {
    backgroundColor: '#00a8ff',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  textoBoton: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  loader: { marginTop: 8, marginBottom: 25 },
  enlace: { color: '#0077b6', fontSize: 15, textAlign: 'center', padding: 8 },
});
