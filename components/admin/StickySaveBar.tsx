'use client';

type Props = {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  label?: string;
  extra?: React.ReactNode;
};

export function StickySaveBar({ dirty, saving, onSave, label = 'Зберегти', extra }: Props) {
  if (!dirty && !saving) return null;
  return (
    <div className='admin-sticky-save' role='region' aria-label='Незбережені зміни'>
      <span className='admin-sticky-save__text'>
        {saving ? 'Збереження…' : 'Є незбережені зміни · Ctrl+S'}
      </span>
      <div className='admin-row'>
        {extra}
        <button type='button' className='admin-btn' disabled={saving || !dirty} onClick={onSave}>
          {saving ? '…' : label}
        </button>
      </div>
    </div>
  );
}
