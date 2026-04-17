import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

function parseDateString(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const startDate = new Date(year, month, 1 - startDay);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    return current;
  });
}

function PremiumDatePicker({
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
  className = "",
  disabled = false,
}) {
  const rootRef = useRef(null);
  const selectedDate = useMemo(() => parseDateString(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const [inputText, setInputText] = useState(value || "");

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
        setInputText(value || "");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setInputText(value || "");
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, value]);

  const today = useMemo(() => new Date(), []);
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const displayedInputValue = isOpen ? inputText : value || "";

  const commitInputValue = () => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      onChange?.("");
      return;
    }

    const parsed = parseDateString(trimmed);
    if (parsed) {
      const normalized = formatDateValue(parsed);
      onChange?.(normalized);
      setInputText(normalized);
      setViewDate(parsed);
    } else {
      setInputText(value || "");
    }
  };

  const handleSelectDate = (date) => {
    const normalized = formatDateValue(date);
    onChange?.(normalized);
    setInputText(normalized);
    setViewDate(date);
    setIsOpen(false);
  };

  const clearValue = () => {
    onChange?.("");
    setInputText("");
    setIsOpen(false);
  };

  const goToToday = () => {
    const current = new Date();
    handleSelectDate(current);
  };

  const monthLabel = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={displayedInputValue}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => {
            if (!disabled) {
              setInputText(value || "");
              setViewDate(selectedDate || new Date());
              setIsOpen(true);
            }
          }}
          onChange={(event) => setInputText(event.target.value)}
          onBlur={commitInputValue}
          className="app-date-input"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsOpen((prev) => !prev);
            }
          }}
          className="app-date-trigger"
          aria-label="Open calendar"
        >
          <CalendarDays size={16} />
        </button>
      </div>

      <div
        className={`app-date-popover ${
          isOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        <div className="app-date-header">
          <button
            type="button"
            onClick={() =>
              setViewDate(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
              )
            }
            className="app-date-nav"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="app-date-title">{monthLabel}</div>

          <button
            type="button"
            onClick={() =>
              setViewDate(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
              )
            }
            className="app-date-nav"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="app-date-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="app-date-grid">
          {calendarDays.map((date) => {
            const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
            const isToday = isSameDay(date, today);
            const isOutsideMonth = date.getMonth() !== viewDate.getMonth();

            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => handleSelectDate(date)}
                className={`app-date-cell ${
                  isOutsideMonth ? "app-date-cell-outside" : ""
                } ${isToday ? "app-date-cell-today" : ""} ${
                  isSelected ? "app-date-cell-selected" : ""
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="app-date-footer">
          <button type="button" onClick={clearValue} className="app-date-link">
            Clear
          </button>
          <button type="button" onClick={goToToday} className="app-date-soft">
            Today
          </button>
        </div>
      </div>
    </div>
  );
}

export default PremiumDatePicker;
