"use client";

import React, { useState } from "react";
import styles from "../../../app/admin.module.css";
import {
  Settings,
  Shield,
  Activity,
  Save,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  Lock,
  User,
  Users
} from "lucide-react";

interface AuditLog {
  id: number;
  time: string;
  user: string;
  action: string;
  active: boolean;
}

export default function AdminSettings() {
  // Cooperative settings parameters
  const [memberYield, setMemberYield] = useState<number>(3.5);
  const [loanBaseRate, setLoanBaseRate] = useState<number>(6.5);
  const [approvalThreshold, setApprovalThreshold] = useState<number>(25000);
  const [monthlyMinimum, setMonthlyMinimum] = useState<number>(100);

  // Success Notification banner
  const [showNotification, setShowNotification] = useState<boolean>(false);

  // Stateful Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: 1,
      time: "Just now",
      user: "Alex Mercer",
      action: "Updated system variables & dividend payouts parameters",
      active: true
    },
    {
      id: 2,
      time: "2 hours ago",
      user: "System Daemon",
      action: "Daily ledger backup completed and archived to encrypted storage",
      active: false
    },
    {
      id: 3,
      time: "5 hours ago",
      user: "Board Auditor (Diana)",
      action: "Generated Q2 compliance report & verified asset balance sheet",
      active: false
    },
    {
      id: 4,
      time: "1 day ago",
      user: "Credit Officer (Sarah)",
      action: "Disbursed Agriculture equipment loan to borrower Thomas Shelby",
      active: false
    }
  ]);

  // Role permissions Matrix state
  const [permissions, setPermissions] = useState({
    member: { register: false, approve: false, yields: false, ledger: true, post: true },
    officer: { register: true, approve: false, yields: false, ledger: true, post: true },
    auditor: { register: false, approve: false, yields: false, ledger: true, post: false },
    board: { register: true, approve: true, yields: true, ledger: true, post: true },
    admin: { register: true, approve: true, yields: true, ledger: true, post: true }
  });

  const togglePermission = (role: keyof typeof permissions, perm: keyof typeof permissions["member"]) => {
    setPermissions({
      ...permissions,
      [role]: {
        ...permissions[role],
        [perm]: !permissions[role][perm]
      }
    });
  };

  const handleSaveParameters = (e: React.FormEvent) => {
    e.preventDefault();

    // Create new log entry
    const newLog: AuditLog = {
      id: Date.now(),
      time: "Just now",
      user: "Alex Mercer",
      action: `Modified base variables: Yield ${memberYield}%, Base Rate ${loanBaseRate}%, Min Contrib $${monthlyMinimum}`,
      active: true
    };

    // Remove active flag from older logs, push new log on top
    const updatedLogs = [newLog, ...auditLogs.map((log) => ({ ...log, active: false }))];
    setAuditLogs(updatedLogs);

    // Show banner & auto-dismiss
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
    }, 4000);
  };

  return (
    <div className={styles.adminPage}>
      {/* Title */}
      <div className={styles.titleArea}>
        <h2>System Administration</h2>
        <p>Configure cooperative variables, manage user role permissions, and view ledger audit logs</p>
      </div>

      {/* Success Notification Banner */}
      {showNotification && (
        <div
          style={{
            background: "var(--primary-glow)",
            border: "1px solid var(--primary)",
            borderRadius: "8px",
            padding: "16px",
            color: "var(--text-primary)",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            animation: "fadeIn 0.2s ease-out"
          }}
        >
          <CheckCircle size={20} style={{ color: "var(--primary)" }} />
          <div>
            <div style={{ fontWeight: 600 }}>Variables Updated Successfully</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>
              Global ledger parameters updated and written to system audit trails.
            </div>
          </div>
        </div>
      )}

      {/* Grid: Settings Form & Audit Log */}
      <div className={styles.gridArea}>
        {/* Settings Panel */}
        <div className={styles.cardPanel}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              <Settings size={18} style={{ color: "var(--primary)" }} />
              <span>Cooperative Fiscal Policy Settings</span>
            </h3>
          </div>

          <form onSubmit={handleSaveParameters} className={styles.settingsForm}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Member Savings Dividend Yield</label>
                <div className={styles.inputWrapper}>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={memberYield}
                    onChange={(e) => setMemberYield(Number(e.target.value))}
                    className={styles.formInput}
                  />
                  <span className={styles.suffix}>% p.a.</span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Loan Base Interest Rate</label>
                <div className={styles.inputWrapper}>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={loanBaseRate}
                    onChange={(e) => setLoanBaseRate(Number(e.target.value))}
                    className={styles.formInput}
                  />
                  <span className={styles.suffix}>% p.a.</span>
                </div>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Board Approval Credit Threshold</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.prefix}>$</span>
                  <input
                    type="number"
                    step="500"
                    required
                    value={approvalThreshold}
                    onChange={(e) => setApprovalThreshold(Number(e.target.value))}
                    className={styles.formInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Min Monthly Shares Deposit</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.prefix}>$</span>
                  <input
                    type="number"
                    step="10"
                    required
                    value={monthlyMinimum}
                    onChange={(e) => setMonthlyMinimum(Number(e.target.value))}
                    className={styles.formInput}
                  />
                </div>
              </div>
            </div>

            <button type="submit" className={styles.saveBtn}>
              <Save size={16} />
              <span>Apply Variable Updates</span>
            </button>
          </form>
        </div>

        {/* Audit Log Panel */}
        <div className={styles.cardPanel}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              <Activity size={18} style={{ color: "var(--accent)" }} />
              <span>System Activity Audit Trails</span>
            </h3>
            <span className="badge badge-info">Secure Log</span>
          </div>

          <div className={styles.auditList}>
            {auditLogs.map((log) => (
              <div key={log.id} className={styles.auditItem}>
                <div className={`${styles.auditDot} ${log.active ? styles.auditDotActive : ""}`} />
                <span className={styles.auditTime}>{log.time}</span>
                <p className={styles.auditText}>
                  <span className={styles.auditUser}>{log.user}</span>: {log.action}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Permissions Matrix */}
      <div className={styles.matrixCard}>
        <div className={styles.sectionHeader} style={{ marginBottom: "8px" }}>
          <h3 className={styles.sectionTitle}>
            <Shield size={18} style={{ color: "var(--accent)" }} />
            <span>Role-Based Access Control (RBAC) Permissions Matrix</span>
          </h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
            5 System Classes
          </span>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "16px" }}>
          Check and uncheck boxes below to adjust access scopes. Changes write immediately to security credentials.
        </p>

        <div className={styles.matrixTableWrapper}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th>System Role</th>
                <th>Register Members</th>
                <th>Approve Loans</th>
                <th>Modify Yields</th>
                <th>View Ledgers</th>
                <th>Post Shares</th>
              </tr>
            </thead>
            <tbody>
              {/* General Admin */}
              <tr>
                <td className={styles.roleCol}>General Admin (Alex Mercer)</td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.admin.register} onChange={() => togglePermission("admin", "register")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.admin.approve} onChange={() => togglePermission("admin", "approve")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.admin.yields} onChange={() => togglePermission("admin", "yields")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.admin.ledger} onChange={() => togglePermission("admin", "ledger")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.admin.post} onChange={() => togglePermission("admin", "post")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
              </tr>

              {/* Board Member */}
              <tr>
                <td className={styles.roleCol}>Board President (Diana)</td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.board.register} onChange={() => togglePermission("board", "register")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.board.approve} onChange={() => togglePermission("board", "approve")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.board.yields} onChange={() => togglePermission("board", "yields")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.board.ledger} onChange={() => togglePermission("board", "ledger")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.board.post} onChange={() => togglePermission("board", "post")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
              </tr>

              {/* Credit Officer */}
              <tr>
                <td className={styles.roleCol}>Credit Officer (Sarah)</td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.officer.register} onChange={() => togglePermission("officer", "register")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.officer.approve} onChange={() => togglePermission("officer", "approve")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.officer.yields} onChange={() => togglePermission("officer", "yields")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.officer.ledger} onChange={() => togglePermission("officer", "ledger")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.officer.post} onChange={() => togglePermission("officer", "post")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
              </tr>

              {/* Auditor */}
              <tr>
                <td className={styles.roleCol}>Auditor Committee</td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.auditor.register} onChange={() => togglePermission("auditor", "register")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.auditor.approve} onChange={() => togglePermission("auditor", "approve")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.auditor.yields} onChange={() => togglePermission("auditor", "yields")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.auditor.ledger} onChange={() => togglePermission("auditor", "ledger")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.auditor.post} onChange={() => togglePermission("auditor", "post")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
              </tr>

              {/* General Member */}
              <tr>
                <td className={styles.roleCol}>General Member</td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.member.register} onChange={() => togglePermission("member", "register")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.member.approve} onChange={() => togglePermission("member", "approve")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.member.yields} onChange={() => togglePermission("member", "yields")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.member.ledger} onChange={() => togglePermission("member", "ledger")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
                <td>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={permissions.member.post} onChange={() => togglePermission("member", "post")} />
                    <span className={styles.checkmark}></span>
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
