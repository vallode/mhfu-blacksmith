// lib.dom.d.ts ships `FileSystemFileHandle`/`getFile()` but not the
// permissions extension or `showOpenFilePicker`, so declare the pieces we
// use ourselves rather than pulling in a third-party types package.
export {};

declare global {
  type FileSystemPermissionMode = "read" | "readwrite";

  interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode;
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor
    ): Promise<PermissionState>;
  }

  interface FileSystemFileHandleAcceptOption {
    description?: string;
    accept: Record<string, string | string[]>;
  }

  interface OpenFilePickerOptions {
    types?: FileSystemFileHandleAcceptOption[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }

  interface Window {
    showOpenFilePicker?(
      options?: OpenFilePickerOptions
    ): Promise<FileSystemFileHandle[]>;
  }
}
