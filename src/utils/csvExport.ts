import { Alert, Platform } from 'react-native';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

// Spreadsheet apps (Excel, Google Sheets, LibreOffice) treat a cell that starts
// with one of these characters as a formula - a leading apostrophe forces it to
// be read as literal text instead, which neutralizes CSV formula-injection from
// free-text fields (e.g. an admin-entered rejection reason) without changing
// what the value visibly reads as.
const FORMULA_INJECTION_RE = /^[=+\-@]/;

function escapeCsvValue(value: string | number | null | undefined): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (FORMULA_INJECTION_RE.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/** Builds CSV text (header row + data rows, no trailing newline) for one table's worth of rows. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvValue(c.value(row))).join(','));
  return [header, ...body].join('\n');
}

export interface DownloadCsvOptions {
  successTitle?: string;
  successMessage?: string;
  shareTitle?: string;
}

/**
 * Same download path used across every admin CSV export: a Blob download on web,
 * the native share sheet on mobile (falling back to the plain RN Share API when
 * expo-sharing isn't available, e.g. no share target installed).
 */
export async function downloadCsv(csvContent: string, filenameBase: string, options?: DownloadCsvOptions): Promise<void> {
  const filename = `${filenameBase}_${Date.now()}.csv`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Alert.alert(options?.successTitle ?? 'Export Complete', options?.successMessage ?? 'CSV download has been initiated.');
    return;
  }

  try {
    const { File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true });
    file.write(csvContent);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: options?.shareTitle ?? 'Export CSV',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      const { Share } = await import('react-native');
      await Share.share({ title: options?.shareTitle ?? 'Export CSV', message: csvContent });
    }
  } catch {
    try {
      const { Share } = await import('react-native');
      await Share.share({ title: options?.shareTitle ?? 'Export CSV', message: csvContent });
    } catch {
      Alert.alert('Export Error', 'Unable to initiate export share sheet.');
    }
  }
}
