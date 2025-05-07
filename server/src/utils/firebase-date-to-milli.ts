import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export function toMillis(
    timestamp: Timestamp | FieldValue | null | undefined
  ): number | null {
    if (timestamp instanceof Timestamp) {
      return timestamp.toMillis();
    }
    return null; // it's either undefined, null, or a FieldValue
}

