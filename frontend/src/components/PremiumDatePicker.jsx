import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const POPOVER_WIDTH = 336;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Wide enough to cover birth-year lookups (DOB) through near-future report
// dates, without making users click "previous month" hundreds of times.
function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  const start = currentYear - 100;
  const end = currentYear + 10;
  return Array.from({ length: end - start + 1 }, (_, index) => end - index);
}

const YEAR_OPTIONS = buildYearOptions();

function PremiumDatePicker({
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
  className = "",
  disabled = false,
  isDateDisabled,
}) {
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const selectedDate = useMemo(() => parseDateString(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const [inputText, setInputText] = useState(value || "");
  // Screen coordinates for the portaled popover. Recomputed whenever the
  // trigger moves, so the calendar tracks it instead of being clipped by
  // whatever scrollable/blurred container the input happens to sit inside.
  const [coords, setCoords] = useState(null);

  const updatePosition = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 320 && rect.top > spaceBelow;
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN
    );

    setCoords({
      left,
      openUp,
      top: openUp ? rect.top - POPOVER_GAP : rect.bottom + POPOVER_GAP,
    });
  };

  // Rendered in a portal at document.body, so overflow:hidden/auto on a
  // modal body or a backdrop-blur stacking context can no longer clip it —
  // the same class of bug that hid the Listbox dropdowns elsewhere in the
  // app. Position is tracked in viewport coordinates instead of relying on
  // a positioned ancestor.
  useEffect(() => {
    if (!isOpen) return undefined;

    updatePosition();

    const handlePointerDown = (event) => {
      const target = event.target;
      if (
        !rootRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
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

    const handleReposition = () => updatePosition();

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition);
    // capture:true — catches scrolling on any ancestor (a modal body, the
    // table wrapper), not just the window itself.
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen, value]);

  const today = useMemo(() => new Date(), []);
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const displayedInputValue = isOpen ? inputText : value || "";

  const openPicker = () => {
    if (disabled) return;
    setInputText(value || "");
    setViewDate(selectedDate || new Date());
    setIsOpen(true);
  };

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

  const goToToday = () => handleSelectDate(new Date());

  return (
    <div ref={rootRef} className={`relative overflow-visible ${className}`}>
      <div className="relative overflow-visible">
        <input
          type="text"
          inputMode="numeric"
          value={displayedInputValue}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={openPicker}
          onChange={(event) => setInputText(event.target.value)}
          onBlur={commitInputValue}
          className="app-date-input"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
          className="app-date-trigger"
          aria-label="Open calendar"
        >
          <CalendarDays size={16} />
        </button>
      </div>

      {isOpen && coords
        ? createPortal(
            <div
              ref={popoverRef}
              onMouseDown={(event) => event.preventDefault()}
              style={{
                position: "fixed",
                left: coords.left,
                width: POPOVER_WIDTH,
                ...(coords.openUp
                  ? { bottom: window.innerHeight - coords.top }
                  : { top: coords.top }),
              }}
              // Must beat every modal that can host this picker — Fiber
              // Inventory's upload modal sits at z-[10000], which used to
              // paint over this popover (a fixed z-9999) and made the
              // calendar look broken/invisible when opened from inside it.
              className="app-date-popover z-[10050]"
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

                <div className="app-date-select-group">
                  <select
                    value={viewDate.getMonth()}
                    onChange={(event) =>
                      setViewDate(
                        (prev) =>
                          new Date(prev.getFullYear(), Number(event.target.value), 1)
                      )
                    }
                    className="app-date-select"
                    aria-label="Select month"
                  >
                    {MONTH_NAMES.map((month, index) => (
                      <option key={month} value={index}>
                        {month}
                      </option>
                    ))}
                  </select>

                  <select
                    value={viewDate.getFullYear()}
                    onChange={(event) =>
                      setViewDate(
                        (prev) =>
                          new Date(Number(event.target.value), prev.getMonth(), 1)
                      )
                    }
                    className="app-date-select"
                    aria-label="Select year"
                  >
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

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
                {calendarDays.map((date, index) => {
                  const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                  const isToday = isSameDay(date, today);
                  const isOutsideMonth = date.getMonth() !== viewDate.getMonth();
                  const isWeekend = index % 7 === 0 || index % 7 === 6;
                  const disabledDate = isDateDisabled ? isDateDisabled(date) : false;

                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      disabled={disabledDate}
                      onClick={() => !disabledDate && handleSelectDate(date)}
                      className={`app-date-cell
                        ${isOutsideMonth ? "app-date-cell-outside" : ""}
                        ${isWeekend && !isOutsideMonth ? "app-date-cell-weekend" : ""}
                        ${isToday && !isSelected ? "app-date-cell-today" : ""}
                        ${isSelected ? "app-date-cell-selected" : ""}
                        ${disabledDate ? "opacity-40 cursor-not-allowed hover:scale-100" : ""}
                      `}
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
                <button
                  type="button"
                  onClick={goToToday}
                  disabled={isDateDisabled ? isDateDisabled(new Date()) : false}
                  className="app-date-link app-date-link-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Today
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default PremiumDatePicker;
