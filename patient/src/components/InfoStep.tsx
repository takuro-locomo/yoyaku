import { useState } from 'react';

interface Props {
  onNext: (info: { name: string; phone: string }) => void;
  onBack: () => void;
}

export default function InfoStep({ onNext, onBack }: Props) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const validate = () => {
    const e: { name?: string; phone?: string } = {};
    if (!name.trim()) {
      e.name = 'お名前を入力してください';
    }
    if (!phone.trim()) {
      e.phone = '電話番号を入力してください';
    } else {
      const digits = phone.replace(/[\s\-()]/g, '');
      if (!/^[0-9+]{8,13}$/.test(digits)) {
        e.phone = '正しい電話番号を入力してください';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onNext({ name: name.trim(), phone: phone.trim() });
  };

  return (
    <div>
      <h2 className="font-bold text-stone-800 text-lg mb-1">お名前・連絡先</h2>
      <p className="text-stone-400 text-sm mb-5">ご本人確認に使用します</p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            お名前 <span className="text-rose-500">*</span>
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="山田 花子"
            className={`w-full border-2 rounded-xl px-4 py-3.5 text-base outline-none
                        focus:border-rose-400 transition-colors ${
              errors.name ? 'border-red-400 bg-red-50' : 'border-stone-200'
            }`}
          />
          {errors.name && (
            <p className="text-xs text-red-500 mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            電話番号 <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="090-1234-5678"
            className={`w-full border-2 rounded-xl px-4 py-3.5 text-base outline-none
                        focus:border-rose-400 transition-colors ${
              errors.phone ? 'border-red-400 bg-red-50' : 'border-stone-200'
            }`}
          />
          {errors.phone && (
            <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
          )}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-4 rounded-2xl bg-rose-500 text-white font-bold text-base
                   hover:bg-rose-600 active:scale-[0.98] transition-all"
      >
        次へ →
      </button>
      <button
        onClick={onBack}
        className="w-full py-3 text-stone-500 text-sm mt-2 hover:text-stone-700 transition-colors"
      >
        ← 戻る
      </button>
    </div>
  );
}
