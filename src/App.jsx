import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './lib/supabaseClient';
import {
  AlertCircle,
  Check,
  Clock,
  LogOut,
  Menu,
  Monitor,
  Coffee,
  Utensils,
  Users,
  GripVertical,
  Phone,
} from 'lucide-react';

// --- CONSTANTS ---

const STATUS_OPTIONS = [
  { id: 'case_called', label: 'Case Called', color: 'bg-indigo-100' },
  { id: 'prep', label: 'Preparation', color: 'bg-yellow-100' },
  { id: 'setup_done', label: 'Setup Done', color: 'bg-orange-100' },
  { id: 'begin', label: 'Begin Monitoring', color: 'bg-green-100' },
  { id: 'done', label: 'Done Monitoring', color: 'bg-blue-100' },
  { id: 'tornoff', label: 'Torn Off', color: 'bg-gray-100' },
];

const CASE_TYPES = ['Crani', 'Spine', 'Ablation', 'EEG'];
const LUNCH_BREAK_OPTS = ['Request', 'No', 'Begin', 'Done'];

// --- UTILITY FUNCTIONS ---

const getFormattedTime = () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const isNumeric = (str) => {
  if (typeof str != 'string') return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
};

const generateEmptySlots = () => {
  const slots = Array.from({ length: 20 }, (_, i) => ({
    lateNumber: (i + 1).toString(),
    label: (i + 1).toString(),
    assignedStaffId: null,
    duty: '',
    assignedName: null,
  }));
  slots.push({
    lateNumber: 'OC',
    label: 'OC',
    assignedStaffId: null,
    duty: '',
    assignedName: null,
  });
  slots.push({
    lateNumber: 'SV',
    label: 'SV',
    assignedStaffId: null,
    duty: '',
    assignedName: null,
  });
  return slots;
};

// --- COMPONENTS ---

const ComboBox = ({
  options,
  value,
  onChange,
  placeholder,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);

  const filteredOptions =
    query === ''
      ? options
      : options.filter((person) => {
          const name = person.name || person;
          return name.toLowerCase().includes(query.toLowerCase());
        });

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <input
        type="text"
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        placeholder={value || placeholder}
        value={isOpen ? query : value || ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setQuery('');
          setIsOpen(true);
        }}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-50 w-full min-w-[150px] mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto left-0">
          {filteredOptions.map((person, idx) => {
            const name = person.name || person;
            return (
              <li
                key={person.id || idx}
                className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm text-gray-700"
                onClick={() => {
                  onChange(name);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                {name}
              </li>
            );
          })}
          <li
            className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm text-gray-500 italic border-t"
            onClick={() => {
              onChange('--');
              setIsOpen(false);
              setQuery('');
            }}
          >
            -- Clear --
          </li>
        </ul>
      )}
    </div>
  );
};

// --- MAIN APP COMPONENT ---

export default function IonmManager() {
  const [appUser, setAppUser] = useState(null);
  const [staffData, setStaffData] = useState([]);
  const [activeTab, setActiveTab] = useState('main');

  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const fetchStaff = async () => {
      const { data, error } = await supabase.from('ionm_staff').select('*');
      if (error) {
        console.error('Error fetching staff:', error);
      } else {
        const sorted = (data || []).sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setStaffData(sorted);
      }
    };

    fetchStaff();

    const channel = supabase
      .channel('public:ionm_staff')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ionm_staff' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setStaffData((prev) =>
              [...prev, payload.new].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
            );
          } else if (payload.eventType === 'UPDATE') {
            setStaffData((prev) =>
              prev.map((item) =>
                item.id === payload.new.id ? payload.new : item
              )
            );
            if (appUser && appUser.id === payload.new.id) {
              setAppUser(payload.new);
            }
          } else if (payload.eventType === 'DELETE') {
            setStaffData((prev) =>
              prev.filter((item) => item.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appUser?.id]);

  const handleLogin = async () => {
    let foundUser = staffData.find((s) => s.name === loginName);

    if (!foundUser) {
      const newUser = {
        name: loginName,
        pin: loginPin || '1234',
        role: loginName.toLowerCase().includes('admin') ? 'admin' : 'user',
        lateNumber: '999',
        status: 'prep',
      };
      const { data, error } = await supabase
        .from('ionm_staff')
        .insert(newUser)
        .select()
        .single();
      if (!error && data) {
        foundUser = data;
      } else {
        setLoginError('Could not create user. Database error.');
        return;
      }
    }

    if (foundUser.pin !== loginPin) {
      setLoginError('Invalid PIN');
      return;
    }

    setAppUser(foundUser);
    setLoginError('');
    setLoginName('');
    setLoginPin('');
    if (foundUser.role === 'admin') setActiveTab('assignment');
    else setActiveTab('main');
  };

  const updateSelf = async (updates) => {
    if (!appUser) return;
    await supabase.from('ionm_staff').update(updates).eq('id', appUser.id);
  };

  const updateAnyStaff = async (staffId, updates) => {
    await supabase.from('ionm_staff').update(updates).eq('id', staffId);
  };

  if (!appUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            IONM Status Tracker
          </h2>
          <p className="text-center text-gray-500 text-xs mt-2">
            Source: Supabase DB
          </p>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 space-y-6">
          <ComboBox
            options={staffData}
            value={loginName}
            onChange={setLoginName}
            placeholder={
              staffData.length === 0 ? 'Loading users...' : 'Select Name...'
            }
          />
          <input
            type="password"
            maxLength={4}
            className="block w-full px-3 py-2 border rounded-md"
            value={loginPin}
            onChange={(e) => setLoginPin(e.target.value)}
            placeholder="PIN"
          />
          {loginError && (
            <div className="text-red-600 text-sm">{loginError}</div>
          )}
          <button
            onClick={handleLogin}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      <nav className="bg-white shadow-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center text-blue-600 font-bold text-xl">
                IONM<span className="text-gray-800">Track</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <NavButton
                  label="Main Panel"
                  active={activeTab === 'main'}
                  onClick={() => setActiveTab('main')}
                />
                <NavButton
                  label="Team Status"
                  active={activeTab === 'status'}
                  onClick={() => setActiveTab('status')}
                />
                {appUser.role === 'admin' && (
                  <NavButton
                    label="Case Assignment"
                    active={activeTab === 'assignment'}
                    onClick={() => setActiveTab('assignment')}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700 font-medium">
                {appUser.name}
              </span>
              <button
                onClick={() => {
                  setAppUser(null);
                  setActiveTab('main');
                }}
                className="text-gray-500 hover:text-red-600"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="sm:hidden border-t flex justify-around p-2 bg-gray-50">
          <NavButtonMobile
            label="Main"
            icon={<Monitor size={18} />}
            active={activeTab === 'main'}
            onClick={() => setActiveTab('main')}
          />
          <NavButtonMobile
            label="Status"
            icon={<Users size={18} />}
            active={activeTab === 'status'}
            onClick={() => setActiveTab('status')}
          />
          {appUser.role === 'admin' && (
            <NavButtonMobile
              label="Admin"
              icon={<Menu size={18} />}
              active={activeTab === 'assignment'}
              onClick={() => setActiveTab('assignment')}
            />
          )}
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'main' && (
          <MainPanel
            user={appUser}
            updateSelf={updateSelf}
            staffList={staffData}
          />
        )}
        {activeTab === 'status' && (
          <TeamStatusPanel
            staffData={staffData}
            currentUserId={appUser.id}
            updateAnyStaff={updateAnyStaff}
          />
        )}
        {activeTab === 'assignment' && (
          <CaseAssignmentPanel staffData={staffData} />
        )}
      </main>
    </div>
  );
}

// --- SUB COMPONENTS ---

function NavButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${
        active
          ? 'border-blue-500 text-gray-900'
          : 'border-transparent text-gray-500 hover:border-gray-300'
      } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full`}
    >
      {label}
    </button>
  );
}

function NavButtonMobile({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-500'
      } flex flex-col items-center justify-center p-2 rounded-md flex-1 mx-1 text-xs font-medium`}
    >
      {icon}
      <span className="mt-1">{label}</span>
    </button>
  );
}

function MainPanel({ user, updateSelf, staffList }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempRoom, setTempRoom] = useState(user.room || '');
  const [tempCaseNum, setTempCaseNum] = useState(user.caseNumber || '');
  const [tempCaseType, setTempCaseType] = useState(user.caseType || '');
  const [tempBegin, setTempBegin] = useState(user.beginTime || '');
  const [tempDone, setTempDone] = useState(user.doneTime || '');

  useEffect(() => {
    setTempRoom(user.room || '');
    setTempCaseNum(user.caseNumber || '');
    setTempCaseType(user.caseType || '');
    setTempBegin(user.beginTime || '');
    setTempDone(user.doneTime || '');
  }, [user]);

  const handleSaveHeader = () => {
    updateSelf({
      room: tempRoom,
      caseNumber: tempCaseNum,
      caseType: tempCaseType,
      beginTime: tempBegin,
      doneTime: tempDone,
    });
    setIsEditing(false);
  };
  const setStatus = (statusId) => {
    const updates = { status: statusId };
    if (statusId === 'begin') updates.beginTime = getFormattedTime();
    else if (statusId === 'done') updates.doneTime = getFormattedTime();
    updateSelf(updates);
  };
  const toggleHelp = () => updateSelf({ helpNeeded: !user.helpNeeded });
  const handleLunchBreak = (type, action) => {
    const updates = { [`${type}Status`]: action };
    if (action === 'No') updates[`${type}Cover`] = '--';
    updateSelf(updates);
  };
  const handleCoverChange = (type, name) =>
    updateSelf({ [`${type}Cover`]: name });

  const renderStatusButton = (opt) => (
    <button
      key={opt.id}
      onClick={() => setStatus(opt.id)}
      className={`flex items-center justify-center p-4 rounded-lg shadow-sm border-2 transition-all font-semibold ${
        user.status === opt.id
          ? `border-blue-600 ring-2 ring-blue-200 ${opt.color}`
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      {opt.id === 'case_called' && (
        <Phone className="mr-2 text-indigo-600" size={18} />
      )}
      {opt.id === 'begin' && <Monitor className="mr-2 text-green-600" />}
      {opt.id === 'done' && <Check className="mr-2 text-blue-600" />}
      {opt.label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 text-blue-800 font-bold text-xl ring-4 ring-white shadow-sm relative">
                {user.lateNumber === '999' ? '-' : user.lateNumber}
              </span>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                  {user.name}
                </h2>
                <div className="text-sm text-gray-500 flex items-center space-x-4">
                  {isEditing ? (
                    <div className="flex space-x-2">
                      <div>
                        <label className="text-xs text-gray-400">Begin</label>
                        <input
                          type="time"
                          value={tempBegin}
                          onChange={(e) => setTempBegin(e.target.value)}
                          className="border rounded px-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Done</label>
                        <input
                          type="time"
                          value={tempDone}
                          onChange={(e) => setTempDone(e.target.value)}
                          className="border rounded px-1 text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {user.beginTime && (
                        <span className="flex items-center">
                          <Clock size={14} className="mr-1" /> Begin:{' '}
                          {user.beginTime}
                        </span>
                      )}
                      {user.doneTime && (
                        <span className="flex items-center">
                          <Check size={14} className="mr-1" /> Done:{' '}
                          {user.doneTime}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={toggleHelp}
                className={`px-3 py-2 rounded-md text-sm font-bold transition-all flex items-center shadow-sm border ${
                  user.helpNeeded
                    ? 'bg-red-600 border-red-700 text-white animate-pulse'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <AlertCircle
                  size={16}
                  className={`mr-2 ${
                    user.helpNeeded ? 'text-white' : 'text-gray-500'
                  }`}
                />
                {user.helpNeeded ? 'HELP CALLED' : 'Request Help'}
              </button>

              <button
                onClick={() =>
                  isEditing ? handleSaveHeader() : setIsEditing(true)
                }
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  isEditing
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {isEditing ? 'Save Changes' : 'Edit Details'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <label className="block text-xs font-semibold text-gray-500 uppercase">
                Room
              </label>
              {isEditing ? (
                <input
                  value={tempRoom}
                  onChange={(e) => setTempRoom(e.target.value)}
                  className="mt-1 w-full border rounded p-1"
                />
              ) : (
                <div className="text-lg font-medium text-gray-900 mt-1">
                  {user.room || '--'}
                </div>
              )}
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <label className="block text-xs font-semibold text-gray-500 uppercase">
                Case Number
              </label>
              {isEditing ? (
                <input
                  value={tempCaseNum}
                  onChange={(e) => setTempCaseNum(e.target.value)}
                  className="mt-1 w-full border rounded p-1"
                />
              ) : (
                <div className="text-lg font-medium text-gray-900 mt-1">
                  {user.caseNumber || '--'}
                </div>
              )}
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <label className="block text-xs font-semibold text-gray-500 uppercase">
                Case Type
              </label>
              {isEditing ? (
                <select
                  value={tempCaseType}
                  onChange={(e) => setTempCaseType(e.target.value)}
                  className="mt-1 w-full border rounded p-1 bg-white"
                >
                  <option value="">-- Select --</option>
                  {CASE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-lg font-medium text-gray-900 mt-1">
                  {user.caseType || '--'}
                </div>
              )}
            </div>
            <div
              className={`p-3 rounded-lg ${
                user.lateCover && user.lateCover !== '--'
                  ? 'bg-yellow-100 border border-yellow-200'
                  : 'bg-gray-50'
              }`}
            >
              <label className="block text-xs font-semibold text-gray-500 uppercase">
                Late Cover
              </label>
              <div className="text-lg font-medium text-gray-900 mt-1">
                {user.lateCover || '--'}
              </div>
            </div>
          </div>
        </div>
        <div
          className={`h-2 w-full ${
            STATUS_OPTIONS.find((s) => s.id === user.status)?.color ||
            'bg-gray-200'
          }`}
        ></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {STATUS_OPTIONS.map(renderStatusButton)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Utensils className="text-orange-500 mr-2" />
            <h3 className="font-bold text-gray-800">Lunch</h3>
            {user.lunchStatus === 'Request' && (
              <span className="ml-auto bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded-full font-bold">
                Requested
              </span>
            )}
          </div>
          <div className="flex space-x-2 mb-4">
            {LUNCH_BREAK_OPTS.map((opt) => (
              <button
                key={opt}
                onClick={() => handleLunchBreak('lunch', opt)}
                className={`flex-1 py-1 px-2 rounded text-sm border ${
                  user.lunchStatus === opt
                    ? 'bg-orange-100 border-orange-400 text-orange-900 font-bold'
                    : 'bg-white border-gray-200'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase">
              Covering Tech
            </label>
            <ComboBox
              options={staffList}
              value={user.lunchCover}
              onChange={(val) => handleCoverChange('lunch', val)}
              placeholder="Select covering tech..."
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Coffee className="text-purple-500 mr-2" />
            <h3 className="font-bold text-gray-800">Break</h3>
            {user.breakStatus === 'Request' && (
              <span className="ml-auto bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded-full font-bold">
                Requested
              </span>
            )}
          </div>
          <div className="flex space-x-2 mb-4">
            {LUNCH_BREAK_OPTS.map((opt) => (
              <button
                key={opt}
                onClick={() => handleLunchBreak('break', opt)}
                className={`flex-1 py-1 px-2 rounded text-sm border ${
                  user.breakStatus === opt
                    ? 'bg-purple-100 border-purple-400 text-purple-900 font-bold'
                    : 'bg-white border-gray-200'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase">
              Covering Tech
            </label>
            <ComboBox
              options={staffList}
              value={user.breakCover}
              onChange={(val) => handleCoverChange('break', val)}
              placeholder="Select covering tech..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamStatusPanel({ staffData, currentUserId, updateAnyStaff }) {
  const sortedStaff = useMemo(() => {
    const assigned = staffData.filter((s) => {
      const ln = s.lateNumber;
      return ln !== '999' && ln !== '';
    });
    return assigned.sort((a, b) => {
      const getVal = (v) => {
        if (v === 'OC') return 21;
        if (v === 'SV') return 22;
        const parsed = parseInt(v);
        return isNaN(parsed) ? 999 : parsed;
      };
      return getVal(a.lateNumber) - getVal(b.lateNumber);
    });
  }, [staffData]);

  const getRowColor = (user) =>
    STATUS_OPTIONS.find((s) => s.id === user.status)?.color || 'bg-white';
  const getCellColor = (user, type) =>
    user[`${type}Status`] === 'Request' || user[`${type}Status`] === 'Begin'
      ? 'bg-pink-100 ring-inset ring-2 ring-pink-200'
      : '';
  const handleEdit = (userId, field, value) =>
    updateAnyStaff(userId, { [field]: value });
  const handleLunchBreakStatusChange = (userId, type, newStatus) => {
    const updates = { [`${type}Status`]: newStatus };
    if (newStatus === 'No') updates[`${type}Cover`] = '--';
    updateAnyStaff(userId, updates);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="overflow-x-auto min-h-[400px]">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-16">
                Late
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 min-w-[150px]">
                Name
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-20">
                Room
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">
                Case
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-20">
                Begin
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-20">
                Done
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">
                Status
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-40">
                Lunch
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-40">
                Break
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-40">
                Late Cover
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedStaff.map((person) => {
              const rowBg = getRowColor(person);
              return (
                <tr key={person.id} className={`${rowBg} hover:bg-opacity-80`}>
                  <td className="px-3 py-2 align-middle">
                    <input
                      className="w-full bg-transparent border-none text-center font-bold focus:ring-0"
                      value={person.lateNumber || ''}
                      onChange={(e) =>
                        handleEdit(person.id, 'lateNumber', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center w-full h-full">
                      <input
                        className={`w-full bg-transparent border-none text-left focus:ring-0 ${
                          person.helpNeeded
                            ? 'text-red-600 font-extrabold animate-pulse'
                            : 'text-gray-900 font-medium'
                        }`}
                        value={person.name}
                        onChange={(e) =>
                          handleEdit(person.id, 'name', e.target.value)
                        }
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      className="w-full bg-transparent border-none focus:ring-0"
                      value={person.room || ''}
                      onChange={(e) =>
                        handleEdit(person.id, 'room', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      className="w-full bg-transparent border-none text-xs focus:ring-0"
                      value={person.caseType || ''}
                      onChange={(e) =>
                        handleEdit(person.id, 'caseType', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="time"
                      className="w-full bg-transparent border-none focus:ring-0"
                      value={person.beginTime || ''}
                      onChange={(e) =>
                        handleEdit(person.id, 'beginTime', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="time"
                      className="w-full bg-transparent border-none focus:ring-0"
                      value={person.doneTime || ''}
                      onChange={(e) =>
                        handleEdit(person.id, 'doneTime', e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <select
                      className="w-full bg-transparent border-none text-xs focus:ring-0 p-0"
                      value={person.status}
                      onChange={(e) =>
                        handleEdit(person.id, 'status', e.target.value)
                      }
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    className={`px-3 py-2 align-middle ${getCellColor(
                      person,
                      'lunch'
                    )}`}
                  >
                    <div className="flex flex-col space-y-1 relative">
                      <select
                        className="bg-transparent text-xs font-bold w-full p-0 border-none focus:ring-0 mb-1"
                        value={person.lunchStatus}
                        onChange={(e) =>
                          handleLunchBreakStatusChange(
                            person.id,
                            'lunch',
                            e.target.value
                          )
                        }
                      >
                        {LUNCH_BREAK_OPTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <ComboBox
                        options={staffData}
                        value={person.lunchCover}
                        onChange={(val) =>
                          handleEdit(person.id, 'lunchCover', val)
                        }
                        placeholder="Cover?"
                        className="w-full"
                      />
                    </div>
                  </td>
                  <td
                    className={`px-3 py-2 align-middle ${getCellColor(
                      person,
                      'break'
                    )}`}
                  >
                    <div className="flex flex-col space-y-1 relative">
                      <select
                        className="bg-transparent text-xs font-bold w-full p-0 border-none focus:ring-0 mb-1"
                        value={person.breakStatus}
                        onChange={(e) =>
                          handleLunchBreakStatusChange(
                            person.id,
                            'break',
                            e.target.value
                          )
                        }
                      >
                        {LUNCH_BREAK_OPTS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <ComboBox
                        options={staffData}
                        value={person.breakCover}
                        onChange={(val) =>
                          handleEdit(person.id, 'breakCover', val)
                        }
                        placeholder="Cover?"
                        className="w-full"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <ComboBox
                      options={staffData}
                      value={person.lateCover}
                      onChange={(val) =>
                        handleEdit(person.id, 'lateCover', val)
                      }
                      placeholder="Late Cover"
                      className="w-full"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CaseAssignmentPanel({ staffData }) {
  const [slots, setSlots] = useState(generateEmptySlots());
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    const newSlots = generateEmptySlots();
    const assignedIds = new Set();

    staffData.forEach((staff) => {
      let slotIndex = -1;
      const num = parseInt(staff.lateNumber);

      if (!isNaN(num) && num >= 1 && num <= 20) {
        slotIndex = num - 1;
      } else if (staff.lateNumber === 'OC') {
        slotIndex = 20;
      } else if (staff.lateNumber === 'SV') {
        slotIndex = 21;
      }

      if (slotIndex !== -1) {
        newSlots[slotIndex] = {
          ...newSlots[slotIndex],
          assignedStaffId: staff.id,
          duty: staff.duty || staff.room || '',
          assignedName: staff.name,
        };
        assignedIds.add(staff.id);
      }
    });

    setSlots(newSlots);
    const unassigned = staffData.filter((s) => !assignedIds.has(s.id));
    setRoster(unassigned.sort((a, b) => a.name.localeCompare(b.name)));
  }, [staffData]);

  const handleDragStart = (e, staffId, source, currentDuty, sourceIndex) => {
    e.dataTransfer.setData('staffId', staffId);
    e.dataTransfer.setData('source', source);
    e.dataTransfer.setData('sourceIndex', sourceIndex);
    e.dataTransfer.setData('duty', currentDuty || '');
  };
  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = async (e, targetIndex) => {
    e.preventDefault();
    const draggedStaffId = e.dataTransfer.getData('staffId');
    const source = e.dataTransfer.getData('source');
    const draggedDuty = e.dataTransfer.getData('duty');

    let targetLateNum;
    if (targetIndex < 20) targetLateNum = (targetIndex + 1).toString();
    else if (targetIndex === 20) targetLateNum = 'OC';
    else if (targetIndex === 21) targetLateNum = 'SV';

    const targetSlot = slots[targetIndex];
    const promises = [];

    if (targetSlot.assignedStaffId) {
      if (source === 'roster') {
        promises.push(
          supabase
            .from('ionm_staff')
            .update({ lateNumber: '999', room: '', duty: '' })
            .eq('id', targetSlot.assignedStaffId)
        );
      } else {
        const draggedStaff = staffData.find((s) => s.id === draggedStaffId);
        if (draggedStaff) {
          promises.push(
            supabase
              .from('ionm_staff')
              .update({ lateNumber: draggedStaff.lateNumber })
              .eq('id', targetSlot.assignedStaffId)
          );
        }
      }
    }

    const isNum = isNumeric(draggedDuty);
    promises.push(
      supabase
        .from('ionm_staff')
        .update({
          lateNumber: targetLateNum,
          duty: draggedDuty,
          room: isNum ? draggedDuty : '',
        })
        .eq('id', draggedStaffId)
    );

    await Promise.all(promises);
  };

  const handleDutyChange = (index, value) => {
    const newSlots = [...slots];
    newSlots[index].duty = value;
    setSlots(newSlots);
  };

  const handleDutyBlur = async (index) => {
    const slot = slots[index];
    if (slot.assignedStaffId) {
      const isNum = isNumeric(slot.duty);
      await supabase
        .from('ionm_staff')
        .update({
          duty: slot.duty,
          room: isNum ? slot.duty : '',
        })
        .eq('id', slot.assignedStaffId);
    }
  };

  const handleResetBoard = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to CLEAR ALL assignments? This will move everyone back to the roster.'
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from('ionm_staff')
      .update({
        lateNumber: '999',
        room: '',
        duty: '',
      })
      .neq('lateNumber', '999');

    if (error) {
      console.error('Error resetting board:', error);
      alert('Failed to reset the board.');
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6">
      <div className="flex-1 bg-white rounded-xl shadow border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>Assignment Board (Live)</span>
            <button
              onClick={handleResetBoard}
              className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors shadow-sm"
            >
              Reset Board
            </button>
          </div>
          <span className="text-xs px-2 py-1 rounded font-bold border bg-green-100 text-green-800 border-green-200">
            Live & Auto-Syncing
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {slots.map((slot, idx) => (
            <div
              key={slot.label}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className={`flex items-center p-1 rounded border transition-colors ${
                slot.assignedStaffId
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-dashed border-gray-300 bg-gray-50'
              }`}
            >
              <div className="w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded-full font-bold text-xs mr-2 flex-shrink-0">
                {slot.label}
              </div>
              <div className="flex-1 flex items-center">
                {slot.assignedName ? (
                  <div
                    className="flex items-center w-full bg-gray-50 rounded p-1 border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-sm"
                    draggable="true"
                    onDragStart={(e) =>
                      handleDragStart(
                        e,
                        slot.assignedStaffId,
                        'slot',
                        slot.duty,
                        idx
                      )
                    }
                  >
                    <GripVertical
                      size={14}
                      className="text-gray-400 mr-2 flex-shrink-0"
                    />
                    <span className="font-semibold text-gray-900 text-sm flex-1 truncate mr-2">
                      {slot.assignedName}
                    </span>
                    <input
                      type="text"
                      placeholder="Rm"
                      className="w-16 p-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 bg-white"
                      value={slot.duty}
                      onChange={(e) => handleDutyChange(idx, e.target.value)}
                      onBlur={() => handleDutyBlur(idx)}
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-gray-400 text-xs italic flex-1 p-1">
                    Drag staff here
                  </div>
                )}
                {!slot.assignedName && (
                  <div className="w-16 h-6 border border-transparent"></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full md:w-64 bg-white rounded-xl shadow border border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700">
          Staff Roster ({roster.length})
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {roster.map((person) => (
            <div
              key={person.id}
              draggable="true"
              onDragStart={(e) =>
                handleDragStart(e, person.id, 'roster', person.duty || '', -1)
              }
              className="p-2 mb-1 bg-white border border-gray-200 rounded shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing flex items-center"
            >
              <GripVertical size={14} className="text-gray-400 mr-2" />
              <span className="text-sm font-medium text-gray-700">
                {person.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
