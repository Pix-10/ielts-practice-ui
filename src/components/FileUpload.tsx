import React, { useCallback } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.docx')) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-blue-400 rounded-xl p-12 text-center hover:border-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
    >
      <input
        type="file"
        accept=".docx"
        onChange={handleChange}
        className="hidden"
        id="file-upload"
        disabled={isLoading}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <div className="text-6xl mb-4">📄</div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">
          {isLoading ? 'Đang đọc file...' : 'Kéo thả file docx vào đây'}
        </h3>
        <p className="text-gray-500">hoặc click để chọn file</p>
        <p className="text-sm text-gray-400 mt-2">Chỉ hỗ trợ file .docx</p>
      </label>
    </div>
  );
};
