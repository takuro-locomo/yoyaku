import { useState } from 'react';
import type { Booking, Menu, ReservationResult } from './types';
import MenuStep    from './components/MenuStep';
import DateStep    from './components/DateStep';
import SlotStep    from './components/SlotStep';
import InfoStep    from './components/InfoStep';
import ConfirmStep from './components/ConfirmStep';

// ── ステップ定義 ──────────────────────────────────────────────────────────────

type Step = 'menu' | 'date' | 'slot' | 'info' | 'confirm' | 'done';

const STEP_ORDER: Step[] = ['menu', 'date', 'slot', 'info', 'confirm', 'done'];

const PROGRESS_STEPS: { key: Step; label: string }[] = [
  { key: 'menu',    label: 'メニュー' },
  { key: 'date',    label: '日付'     },
  { key: 'slot',    label: '時間'     },
  { key: 'info',    label: 'お名前'   },
  { key: 'confirm', label: '確認'     },
];

const EMPTY_BOOKING: Booking = {
  menu:       { id: '', name: '', durationMin: 0 },
  date:       '',
  slot:       '',
  name:       '',
  phone:      '',
  lineUserId: '',
};

// ── メインコンポーネント ───────────────────────────────────────────────────────

export default function App() {
  const [step, setStep]         = useState<Step>('menu');
  const [booking, setBooking]   = useState<Booking>(EMPTY_BOOKING);
  const [result, setResult]     = useState<ReservationResult | null>(null);

  const stepIdx = STEP_ORDER.indexOf(step);

  const advance = (partial: Partial<Booking>) => {
    setBooking(b => ({ ...b, ...partial }));
    setStep(STEP_ORDER[stepIdx + 1] ?? 'done');
  };

  const back = () => {
    if (stepIdx > 0) setStep(STEP_ORDER[stepIdx - 1]);
  };

  const reset = () => {
    setBooking(EMPTY_BOOKING);
    setResult(null);
    setStep('menu');
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-sm mx-auto px-4 py-3 flex items-center justify-center">
          <h1 className="font-bold text-stone-800 tracking-wide">クリニック ご予約</h1>
        </div>
      </header>

      {/* ── Progress bar ── */}
      {step !== 'done' && (
        <div className="bg-white border-b border-stone-100">
          <div className="max-w-sm mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {PROGRESS_STEPS.map(({ key, label }, i) => {
                const isCurrent = key === step;
                const isDone    = STEP_ORDER.indexOf(key) < stepIdx;
                return (
                  <div key={key} className="flex flex-col items-center gap-0.5 flex-1">
                    <div
                      className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center
                                  transition-colors ${
                        isDone    ? 'bg-rose-200 text-rose-600'  :
                        isCurrent ? 'bg-rose-500 text-white shadow-sm' :
                                    'bg-stone-100 text-stone-300'
                      }`}
                    >
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span className={`text-[10px] ${
                      isCurrent ? 'text-rose-600 font-semibold' :
                      isDone    ? 'text-rose-400' :
                                  'text-stone-300'
                    }`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 max-w-sm mx-auto w-full px-4 py-6">

        {step === 'menu' && (
          <MenuStep
            onNext={(menu: Menu) => advance({ menu })}
          />
        )}

        {step === 'date' && (
          <DateStep
            menuName={booking.menu.name}
            value={booking.date}
            onNext={(date: string) => advance({ date })}
            onBack={back}
          />
        )}

        {step === 'slot' && (
          <SlotStep
            menuId={booking.menu.id}
            menuName={booking.menu.name}
            date={booking.date}
            onNext={(slot: string) => advance({ slot })}
            onBack={back}
          />
        )}

        {step === 'info' && (
          <InfoStep
            onNext={(info: { name: string; phone: string }) => advance(info)}
            onBack={back}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            booking={booking}
            onSuccess={(r: ReservationResult) => {
              setResult(r);
              setStep('done');
            }}
            onBack={back}
          />
        )}

        {step === 'done' && result && (
          <DoneScreen result={result} booking={booking} onReset={reset} />
        )}

      </main>
    </div>
  );
}

// ── 完了画面 (インライン) ─────────────────────────────────────────────────────

interface DoneProps {
  result:  ReservationResult;
  booking: Booking;
  onReset: () => void;
}

function formatDate(ymd: string): string {
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(ymd).getDay()];
  const [y, m, d] = ymd.split('-');
  return `${y}年${Number(m)}月${Number(d)}日（${dow}）`;
}

function DoneScreen({ result, booking, onReset }: DoneProps) {
  const rows = [
    { label: 'メニュー',  value: booking.menu.name },
    { label: '日付',      value: formatDate(booking.date) },
    { label: '時間',      value: `${booking.slot} 〜` },
    { label: 'お名前',    value: booking.name },
    { label: '電話番号',  value: booking.phone },
  ];

  return (
    <div className="text-center">
      <div className="text-6xl mb-4 mt-4">✅</div>
      <h2 className="text-xl font-bold text-stone-800 mb-1">予約が完了しました</h2>
      <p className="text-stone-400 text-sm mb-6">ご予約ありがとうございます。</p>

      {/* Confirmation number */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4 mb-5">
        <p className="text-xs text-rose-400 mb-1">予約番号</p>
        <p className="text-2xl font-bold text-rose-600 tracking-widest">{result.confirmationNo}</p>
        <p className="text-xs text-stone-400 mt-1">
          当日こちらの番号をお伝えください
        </p>
      </div>

      {/* Booking details */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 text-left mb-8">
        <div className="divide-y divide-stone-100">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-3 text-sm">
              <span className="text-stone-400">{label}</span>
              <span className="text-stone-800 font-semibold text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onReset}
        className="text-sm text-stone-400 hover:text-stone-600 underline transition-colors"
      >
        別の予約をする
      </button>
    </div>
  );
}
