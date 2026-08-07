import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const DateTimePicker = ({
  value,
  onChange,
  minDateTime,
  placeholder = 'Select Date & Time',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // Date object
  const [viewMonth, setViewMonth] = useState(new Date()); // Date object representing the month shown
  const [hours, setHours] = useState('12');
  const [minutes, setMinutes] = useState('00');

  const containerRef = useRef(null);

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setViewMonth(d);
        setHours(String(d.getHours()).padStart(2, '0'));
        setMinutes(String(d.getMinutes()).padStart(2, '0'));
      }
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysCount };
  };

  const handleMonthChange = (direction) => {
    const newMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1);
    setViewMonth(newMonth);
  };

  const handleDaySelect = (day) => {
    const newDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    newDate.setHours(parseInt(hours) || 0);
    newDate.setMinutes(parseInt(minutes) || 0);
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);

    if (minDateTime && newDate < minDateTime) {
      setSelectedDate(minDateTime);
      onChange(minDateTime.toISOString());
    } else {
      setSelectedDate(newDate);
      onChange(newDate.toISOString());
    }
  };

  const handleTimeChange = (type, val) => {
    let cleanVal = parseInt(val) || 0;
    if (type === 'hours') {
      if (cleanVal < 0) cleanVal = 0;
      if (cleanVal > 23) cleanVal = 23;
      setHours(String(cleanVal).padStart(2, '0'));
    } else {
      if (cleanVal < 0) cleanVal = 0;
      if (cleanVal > 59) cleanVal = 59;
      setMinutes(String(cleanVal).padStart(2, '0'));
    }

    const currentSel = selectedDate || new Date();
    const newDate = new Date(currentSel.getTime());
    if (type === 'hours') {
      newDate.setHours(cleanVal);
    } else {
      newDate.setMinutes(cleanVal);
    }
    
    if (minDateTime && newDate < minDateTime) {
      setSelectedDate(minDateTime);
      onChange(minDateTime.toISOString());
    } else {
      setSelectedDate(newDate);
      onChange(newDate.toISOString());
    }
  };

  const { firstDay, daysCount } = getDaysInMonth(viewMonth);
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysCount; i++) {
    days.push(i);
  }

  const isDayDisabled = (day) => {
    if (!day) return true;
    if (!minDateTime) return false;
    const checkDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day, 23, 59, 59);
    return checkDate < minDateTime;
  };

  const isDaySelected = (day) => {
    if (!day || !selectedDate) return false;
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === viewMonth.getMonth() &&
      selectedDate.getFullYear() === viewMonth.getFullYear()
    );
  };

  const formatDisplay = () => {
    if (!selectedDate) return '';
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hours}:${minutes}`;
  };

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="form-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? 'rgba(0,0,0,0.02)' : 'var(--bg-surface)',
          opacity: disabled ? 0.7 : 1,
          padding: '10px 14px',
          userSelect: 'none'
        }}
      >
        <span style={{ color: selectedDate ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {formatDisplay() || placeholder}
        </span>
        <CalendarIcon size={16} style={{ color: 'var(--text-muted)' }} />
      </div>

      {isOpen && (
        <div 
          className="glass-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 1100,
            padding: '16px',
            width: '320px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
            border: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-surface)'
          }}
        >
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', userSelect: 'none' }}>
            <button 
              type="button"
              onClick={() => handleMonthChange(-1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {monthsList[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button 
              type="button"
              onClick={() => handleMonthChange(1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday Labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '6px', userSelect: 'none' }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w, idx) => (
              <span key={idx} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{w}</span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '16px', userSelect: 'none' }}>
            {days.map((day, idx) => {
              const disabledDay = isDayDisabled(day);
              const sel = isDaySelected(day);

              return (
                <div
                  key={idx}
                  onClick={() => !disabledDay && handleDaySelect(day)}
                  style={{
                    fontSize: '0.85rem',
                    padding: '6px 0',
                    borderRadius: '4px',
                    cursor: disabledDay ? 'not-allowed' : 'pointer',
                    color: disabledDay ? 'var(--text-muted)' : sel ? '#fff' : 'var(--text-primary)',
                    backgroundColor: sel ? 'var(--primary)' : 'transparent',
                    fontWeight: sel ? 600 : 'normal',
                    opacity: disabledDay ? 0.35 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {day || ''}
                </div>
              );
            })}
          </div>

          {/* Time Picker Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
            <Clock size={16} style={{ color: 'var(--text-muted)', marginRight: '4px' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Time:</span>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'flex-end' }}>
              <input
                type="number"
                min="0"
                max="23"
                value={hours}
                onChange={(e) => handleTimeChange('hours', e.target.value)}
                style={{ width: '48px', textAlign: 'center', padding: '4px 6px', fontSize: '0.85rem' }}
                className="form-input"
                title="Hours (24h)"
              />
              <span style={{ fontWeight: 600 }}>:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => handleTimeChange('minutes', e.target.value)}
                style={{ width: '48px', textAlign: 'center', padding: '4px 6px', fontSize: '0.85rem' }}
                className="form-input"
                title="Minutes"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateTimePicker;
