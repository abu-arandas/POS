import { useState } from 'react';
import { UserAccount } from '../types';
import { ShieldAlert, User, Delete, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LockscreenProps {
  users: UserAccount[];
  onLogin: (user: UserAccount) => void;
  storeName: string;
}

export default function Lockscreen({ users, onLogin, storeName }: LockscreenProps) {
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  const activeUsers = users.filter(u => u.active);

  const handleKeyPress = (num: string) => {
    if (error) setError(false);
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      
      // Automatically check pin once 4 digits are entered
      if (nextPin.length === 4) {
        if (selectedUser && selectedUser.pin === nextPin) {
          onLogin(selectedUser);
        } else {
          // Play mistake state
          setError(true);
          setPin('');
          // Clear error vibration/shake after a split-second
          setTimeout(() => setError(false), 800);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  };

  const handleClear = () => {
    setPin('');
  };

  const handleBackToUsers = () => {
    setSelectedUser(null);
    setPin('');
    setError(false);
  };

  return (
    <div id="lockscreen-root" className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center p-4">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

      {/* Terminal Title */}
      <div className="text-center mb-8 shrink-0 z-10">
        <h1 className="font-sans font-extrabold text-2xl tracking-tight text-white mb-1">
          {storeName}
        </h1>
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold px-3 py-1 rounded-full inline-block">
          ● SECURE TERMINAL LOCK
        </div>
      </div>

      <div className="w-full max-w-sm bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-2xl z-10 relative overflow-hidden flex flex-col min-h-[460px]">
        <AnimatePresence mode="wait">
          {!selectedUser ? (
            /* SCREEN 1: SELECT STAFF ACCOUNT */
            <motion.div
              key="user-select"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-1 flex flex-col space-y-4"
            >
              <div className="text-center pb-2">
                <h2 className="text-slate-200 font-sans font-bold text-base">Select Staff Profile</h2>
                <p className="text-slate-500 text-xs mt-0.5">Choose your account to login to terminal</p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[300px]">
                {activeUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="w-full flex items-center justify-between p-4 bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700/80 rounded-2xl transition-all group text-left"
                  >
                    <div className="flex items-center space-x-3.5">
                      <div className="bg-slate-800 text-slate-300 p-2.5 rounded-xl group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <h4 className="text-white text-xs font-bold font-sans">{user.name}</h4>
                        <span className="text-[10px] uppercase font-mono font-bold text-slate-500 tracking-wider">
                          Role: {user.role}
                        </span>
                      </div>
                    </div>
                    <div className="bg-slate-900 px-2.5 py-1 rounded-lg text-[9px] text-slate-400 font-mono group-hover:text-emerald-400 transition-colors">
                      PIN Required
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            /* SCREEN 2: ENTER PIN NUMBER */
            <motion.div
              key="pin-entry"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col items-center justify-between space-y-4"
            >
              {/* Back Button and Header */}
              <div className="w-full flex items-center justify-between border-b border-slate-800/50 pb-3">
                <button
                  onClick={handleBackToUsers}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-colors"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <div className="text-right">
                  <h3 className="text-white text-xs font-bold font-sans">{selectedUser.name}</h3>
                  <span className="text-[9px] uppercase font-mono font-bold text-slate-500 tracking-wider">{selectedUser.role}</span>
                </div>
              </div>

              {/* Pin Circles display with shake on error */}
              <motion.div
                animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center justify-center space-y-3 my-2"
              >
                <div className="flex justify-center space-x-4">
                  {[0, 1, 2, 3].map(idx => (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                        error
                          ? 'bg-rose-500 border-rose-500 shadow-md shadow-rose-500/20'
                          : pin.length > idx
                          ? 'bg-emerald-400 border-emerald-400 shadow-md shadow-emerald-400/20'
                          : 'bg-transparent border-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <div className="h-4">
                  {error && (
                    <span className="text-[10px] text-rose-400 font-bold font-mono tracking-wider flex items-center gap-1">
                      <ShieldAlert size={11} /> INCORRECT PIN CODE
                    </span>
                  )}
                </div>
              </motion.div>

              {/* PIN Keypad Grid */}
              <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    onClick={() => handleKeyPress(num)}
                    className="h-12 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-100 hover:text-white font-mono text-base font-bold rounded-2xl transition-all active:scale-95"
                  >
                    {num}
                  </button>
                ))}
                
                <button
                  onClick={handleClear}
                  className="h-12 bg-slate-950/20 hover:bg-slate-800 text-slate-500 hover:text-rose-400 font-semibold text-[11px] rounded-2xl transition-all uppercase"
                >
                  Clear
                </button>
                
                <button
                  onClick={() => handleKeyPress('0')}
                  className="h-12 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-100 hover:text-white font-mono text-base font-bold rounded-2xl transition-all active:scale-95"
                >
                  0
                </button>

                <button
                  onClick={handleBackspace}
                  className="h-12 bg-slate-950/20 hover:bg-slate-800 text-slate-500 hover:text-white flex items-center justify-center rounded-2xl transition-all"
                  aria-label="Backspace"
                >
                  <Delete size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Helper Footer Hint */}
      <div className="mt-6 text-center text-slate-600 font-mono text-[10px] z-10 max-w-xs">
        Default testing PINs: <br/>
        Admin: <strong className="text-slate-400 font-semibold">1234</strong> | 
        Manager: <strong className="text-slate-400 font-semibold">5555</strong> | 
        Cashier: <strong className="text-slate-400 font-semibold">0000</strong>
      </div>
    </div>
  );
}
