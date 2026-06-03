import React, { useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Field';
import { Spinner } from './Spinner';

const PrintPreviewModal = ({
  open,
  onClose,
  html,
  title = "Print Preview",
  onConfirmPrint
}) => {
  const [paperSize, setPaperSize] = useState('A4');
  const [margins, setMargins] = useState('none');
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    try {
      if (onConfirmPrint) {
        await onConfirmPrint({ paperSize, margins });
      }
      onClose();
    } catch (error) {
      console.error("Print failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePrint}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            {loading ? <Spinner size="sm" color="white" /> : null}
            Print Now
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-[70vh]">
        <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded border">
          <Field label="Paper Size">
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value)}
              className="w-full p-2 border rounded bg-white"
            >
              <option value="A4">A4 (Standard)</option>
              <option value="A5">A5 (Half A4)</option>
              <option value="Letter">Letter</option>
              <option value="Thermal80">Thermal 80mm</option>
              <option value="Thermal58">Thermal 58mm</option>
            </select>
          </Field>
          <Field label="Margins">
            <select
              value={margins}
              onChange={(e) => setMargins(e.target.value)}
              className="w-full p-2 border rounded bg-white"
            >
              <option value="none">No Margins</option>
              <option value="default">Default</option>
              <option value="minimum">Minimum</option>
            </select>
          </Field>
        </div>

        <div className="flex-1 bg-gray-200 p-4 overflow-auto rounded border flex justify-center">
          <div
            className="bg-white shadow-lg p-8 origin-top"
            style={{
              width: paperSize.startsWith('Thermal') ? '300px' : '210mm',
              minHeight: '297mm'
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PrintPreviewModal;
