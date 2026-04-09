import { useState, useEffect, useCallback, useRef } from 'react'

const API = 'http://localhost:3001'
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const SHIFTS = ['morning', 'afternoon', 'night']
const SHIFT_LABELS = { morning: 'Morning (06–14)', afternoon: 'Afternoon (14–22)', night: 'Night (22–06)' }
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }
const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ALL_SHIFTS = ['Morning', 'Afternoon', 'Night']

function useDebounce(fn, delay) {
  const timerRef = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

export default function Home() {
  const [employees, setEmployees] = useState([])
  const [schedule, setSchedule] = useState({})
  const [violations, setViolations] = useState([])
  const [fairness, setFairness] = useState(null)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [modal, setModal] = useState(null) // { day, shift, currentIds }
  const [modalSelected, setModalSelected] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [empsRes, schedRes] = await Promise.all([
        fetch(`${API}/employees`),
        fetch(`${API}/schedule`),
      ])
      const emps = await empsRes.json()
      const schedData = await schedRes.json()
      setEmployees(emps)
      setSchedule(schedData.schedule || {})
      setViolations(schedData.violations || [])
      setFairness(schedData.fairness ?? null)
    } catch (e) {
      console.error('fetchAll error', e)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const addEmployee = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !newRole.trim()) return
    try {
      const res = await fetch(`${API}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), role: newRole.trim() }),
      })
      const emp = await res.json()
      setEmployees(prev => [...prev, emp])
      setNewName('')
      setNewRole('')
    } catch (e) {
      console.error('addEmployee error', e)
    }
  }

  const deleteEmployee = async (id) => {
    try {
      await fetch(`${API}/employees/${id}`, { method: 'DELETE' })
      setEmployees(prev => prev.filter(e => e.id !== id))
      await fetchAll()
    } catch (e) {
      console.error('deleteEmployee error', e)
    }
  }

  const updateEmployeeField = async (id, field, value) => {
    try {
      await fetch(`${API}/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } catch (e) {
      console.error('updateEmployee error', e)
    }
  }

  const handleMaxHoursChange = async (emp, value) => {
    const updated = employees.map(e => e.id === emp.id ? { ...e, max_hours: Number(value) } : e)
    setEmployees(updated)
    await updateEmployeeField(emp.id, 'max_hours', Number(value))
  }

  const handleDayOffChange = async (emp, day, checked) => {
    const current = emp.days_off || []
    const newDaysOff = checked
      ? [...current.filter(d => d !== day), day]
      : current.filter(d => d !== day)
    const updated = employees.map(e => e.id === emp.id ? { ...e, days_off: newDaysOff } : e)
    setEmployees(updated)
    await updateEmployeeField(emp.id, 'days_off', newDaysOff)
  }

  const handlePreferredShiftChange = async (emp, shift, checked) => {
    const current = emp.preferred_shifts || []
    const newShifts = checked
      ? [...current.filter(s => s !== shift), shift]
      : current.filter(s => s !== shift)
    const updated = employees.map(e => e.id === emp.id ? { ...e, preferred_shifts: newShifts } : e)
    setEmployees(updated)
    await updateEmployeeField(emp.id, 'preferred_shifts', newShifts)
  }

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/schedule/generate`, { method: 'POST' })
      const data = await res.json()
      setSchedule(data.schedule || {})
      setViolations(data.violations || [])
      setFairness(data.fairness ?? null)
    } catch (e) {
      console.error('generate error', e)
    }
    setLoading(false)
  }

  const handleReset = async () => {
    try {
      await fetch(`${API}/reset`, { method: 'POST' })
      setEmployees([])
      setSchedule({})
      setViolations([])
      setFairness(null)
    } catch (e) {
      console.error('reset error', e)
    }
  }

  const openModal = (day, shift) => {
    const key = `${day}-${shift}`
    const current = schedule[key] ? schedule[key].employee_ids || [] : []
    setModalSelected([...current])
    setModal({ day, shift })
  }

  const closeModal = () => {
    setModal(null)
    setModalSelected([])
  }

  const toggleModalEmp = (id) => {
    setModalSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const confirmOverride = async () => {
    if (!modal) return
    const { day, shift } = modal
    try {
      const res = await fetch(`${API}/schedule/${day}/${shift}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: modalSelected }),
      })
      const data = await res.json()
      const key = `${day}-${shift}`
      setSchedule(prev => ({
        ...prev,
        [key]: { employee_ids: data.employee_ids, names: data.names },
      }))
      setViolations(data.violations || [])
      setFairness(data.fairness ?? null)
    } catch (e) {
      console.error('override error', e)
    }
    closeModal()
  }

  const getCellNames = (day, shift) => {
    const key = `${day}-${shift}`
    const cell = schedule[key]
    if (!cell || !cell.names || cell.names.length === 0) return []
    return cell.names
  }

  return (
    <div className="layout">
      {/* Employee Panel */}
      <div className="employee-panel" data-testid="employee-panel">
        <h2>Employees</h2>
        <form className="add-form" onSubmit={addEmployee}>
          <input
            placeholder="Name"
            name="name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            placeholder="Role"
            name="role"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
          />
          <button type="submit">Add Employee</button>
        </form>

        {employees.map(emp => (
          <div key={emp.id} className="employee-row" data-testid={`employee-${emp.id}`}>
            <div className="employee-row-header">
              <div>
                <div className="employee-name">{emp.name}</div>
                <div className="employee-role">{emp.role}</div>
              </div>
              <button className="delete-btn" onClick={() => deleteEmployee(emp.id)}>×</button>
            </div>

            {/* Max hours */}
            <div className="constraint-row">
              <div className="constraint-label">Max hours/week</div>
              <select
                value={emp.max_hours}
                onChange={e => handleMaxHoursChange(emp, e.target.value)}
              >
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="40">40</option>
              </select>
            </div>

            {/* Days off */}
            <div className="constraint-row">
              <div className="constraint-label">Days off</div>
              <div className="checkbox-group">
                {ALL_DAYS.map(day => {
                  const dayLower = day.toLowerCase()
                  const checked = (emp.days_off || []).map(d => d.toLowerCase()).includes(dayLower)
                  return (
                    <label key={day}>
                      <input
                        type="checkbox"
                        value={day}
                        name={`dayoff-${emp.id}-${dayLower}`}
                        id={`dayoff-${emp.id}-${dayLower}`}
                        checked={checked}
                        onChange={e => handleDayOffChange(emp, dayLower, e.target.checked)}
                      />
                      {day.slice(0, 3)}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Preferred shifts */}
            <div className="constraint-row">
              <div className="constraint-label">Preferred shifts</div>
              <div className="checkbox-group">
                {ALL_SHIFTS.map(shift => {
                  const shiftLower = shift.toLowerCase()
                  const checked = (emp.preferred_shifts || []).map(s => s.toLowerCase()).includes(shiftLower)
                  return (
                    <label key={shift}>
                      <input
                        type="checkbox"
                        value={shift}
                        name={`pref-${emp.id}-${shiftLower}`}
                        id={`pref-${emp.id}-${shiftLower}`}
                        checked={checked}
                        onChange={e => handlePreferredShiftChange(emp, shiftLower, e.target.checked)}
                      />
                      {shift.slice(0, 3)}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main area */}
      <div className="main-area">
        {/* Top bar */}
        <div className="top-bar">
          <button
            className="generate-btn"
            data-testid="generate-btn"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Schedule'}
          </button>
          <button className="reset-btn" data-testid="reset-btn" onClick={handleReset}>
            Delete All Data
          </button>
          <div className="fairness-box">
            Fairness Score:{' '}
            <span data-testid="fairness-score">
              {fairness !== null && fairness !== undefined ? fairness : '--'}
            </span>
          </div>
        </div>

        {/* Schedule Grid */}
        <div className="schedule-grid" data-testid="schedule-grid">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Shift</th>
                {DAYS.map(d => (
                  <th key={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map(shift => (
                <tr key={shift}>
                  <td className="shift-label">{SHIFT_LABELS[shift]}</td>
                  {DAYS.map(day => {
                    const names = getCellNames(day, shift)
                    return (
                      <td key={day}>
                        <div
                          className="cell"
                          data-testid={`cell-${day}-${shift}`}
                          onClick={() => openModal(day, shift)}
                        >
                          {names.map((name, i) => (
                            <div key={i} className="cell-name">{name}</div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Violations Panel */}
        <div className="violations-panel" data-testid="violations">
          <h3>Constraint Violations</h3>
          {violations.length === 0 ? (
            <div className="no-violations">No violations</div>
          ) : (
            violations.map((v, i) => (
              <div key={i} className="violation-item" data-testid={`violation-${i}`}>
                {v}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Override Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog">
            <h3>
              Edit: {modal.day.charAt(0).toUpperCase() + modal.day.slice(1)} –{' '}
              {modal.shift.charAt(0).toUpperCase() + modal.shift.slice(1)}
            </h3>
            <div className="modal-emp-list">
              {employees.map(emp => (
                <label key={emp.id} className="modal-emp-item">
                  <input
                    type="checkbox"
                    checked={modalSelected.includes(emp.id)}
                    onChange={() => toggleModalEmp(emp.id)}
                  />
                  {emp.name} ({emp.role})
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeModal}>Cancel</button>
              <button className="btn-confirm" onClick={confirmOverride}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
