import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Credenciales reales extraídas de tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDzgFlzWrhwz3P9FUkfoJ9kB1xu6bRJ58s",
  authDomain: "registroasistencianfc-1edbc.firebaseapp.com",
  projectId: "registroasistencianfc-1edbc",
  storageBucket: "registroasistencianfc-1edbc.firebasestorage.app",
  messagingSenderId: "87321543642",
  appId: "1:87321543642:web:6846f2e37b2e166ec5f6e3" // ID web adaptado para el SDK multiplataforma
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

class ReactNativeAsyncStoragePersistence {
  static readonly type = 'LOCAL';
  readonly type = 'LOCAL';

  async _isAvailable() {
    const key = 'firebase-auth-persistence-check';
    try {
      await AsyncStorage.setItem(key, '1');
      await AsyncStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  async _set(key: string, value: unknown) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('No se pudo persistir la sesión de Firebase Auth.');
    }
    await AsyncStorage.setItem(key, serialized);
  }

  async _get(key: string) {
    const serialized = await AsyncStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  }

  async _remove(key: string) {
    await AsyncStorage.removeItem(key);
  }

  _addListener(_key: string, _listener: (value: unknown) => void) {}

  _removeListener(_key: string, _listener: (value: unknown) => void) {}
}

export const auth = initializeAuth(app, {
  persistence: ReactNativeAsyncStoragePersistence,
});

// Configuración de Firestore (base de datos de estudiantes y asistencias)
export const db = getFirestore(app);
export const storage = getStorage(app);