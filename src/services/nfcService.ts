import NfcManager, { NfcEvents, TagEvent } from 'react-native-nfc-manager';

export function normalizarUidNfc(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function leerUidTarjetaNfc(): Promise<string> {
  await NfcManager.start();
  if (!(await NfcManager.isEnabled())) {
    throw new Error('NFC está desactivado. Actívalo en los ajustes del sistema.');
  }

  return new Promise<string>((resolve, reject) => {
    let finalizado = false;

    const terminar = async (uid: string | null, error?: Error) => {
      if (finalizado) return;
      finalizado = true;
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);

      try {
        await NfcManager.unregisterTagEvent();
      } catch (errorLimpieza: unknown) {
        const mensajeLimpieza =
          errorLimpieza instanceof Error ? errorLimpieza.message : String(errorLimpieza);
        if (error) {
          reject(new Error(`${error.message} No se pudo cerrar la lectura NFC: ${mensajeLimpieza}`));
          return;
        }
        reject(new Error(`No se pudo cerrar la lectura NFC: ${mensajeLimpieza}`));
        return;
      }

      if (error) {
        reject(error);
      } else if (uid) {
        resolve(uid);
      } else {
        reject(new Error('La tarjeta detectada no proporcionó un UID.'));
      }
    };

    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
      const uid = typeof tag.id === 'string' ? normalizarUidNfc(tag.id) : '';
      void terminar(uid || null, uid ? undefined : new Error('La tarjeta no contiene un UID legible.'));
    });

    NfcManager.registerTagEvent({ alertMessage: 'Acerca una tarjeta NFC al dispositivo.' }).catch(
      (error: unknown) => {
        const mensaje = error instanceof Error ? error.message : String(error);
        void terminar(null, new Error(`No se pudo iniciar el lector NFC: ${mensaje}`));
      },
    );
  });
}
