"use client";

import React, { useState } from "react";
import styles from "../../../app/members.module.css";
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  X,
  UserPlus,
  ChevronDown,
  ArrowUpDown,
  Mail,
  Phone
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  joined: string;
  shares: number;
  savings: number;
  status: "Active" | "Pending" | "Suspended";
  avatar: string;
}

export default function MembersDirectory() {
  // Initial Seed Data for Cooperative Members
  const [members, setMembers] = useState<Member[]>([
    {
      id: "CO-8721",
      name: "Eleanor Vance",
      email: "eleanor@vance.coop",
      phone: "+1 (555) 234-5678",
      joined: "Jan 12, 2024",
      shares: 42500,
      savings: 28900,
      status: "Active",
      avatar: "EV"
    },
    {
      id: "CO-8722",
      name: "Marcus Thorne",
      email: "marcus@thorne.coop",
      phone: "+1 (555) 345-6789",
      joined: "Feb 05, 2024",
      shares: 31000,
      savings: 15400,
      status: "Active",
      avatar: "MT"
    },
    {
      id: "CO-8723",
      name: "Sarah Jenkins",
      email: "sjenkins@gmail.com",
      phone: "+1 (555) 456-7890",
      joined: "Mar 20, 2024",
      shares: 18500,
      savings: 8200,
      status: "Active",
      avatar: "SJ"
    },
    {
      id: "CO-8724",
      name: "Albert Einstein",
      email: "albert@einstein.coop",
      phone: "+1 (555) 567-8901",
      joined: "Apr 15, 2024",
      shares: 75000,
      savings: 42000,
      status: "Active",
      avatar: "AE"
    },
    {
      id: "CO-8725",
      name: "Julian Alvarez",
      email: "julian@alvarez.coop",
      phone: "+1 (555) 678-9012",
      joined: "May 10, 2024",
      shares: 12000,
      savings: 4500,
      status: "Pending",
      avatar: "JA"
    },
    {
      id: "CO-8726",
      name: "Diana Prince",
      email: "diana@themyscira.coop",
      phone: "+1 (555) 789-0123",
      joined: "Jun 01, 2024",
      shares: 95000,
      savings: 68000,
      status: "Suspended",
      avatar: "DP"
    }
  ]);

  // UI Interactive States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sortField, setSortField] = useState<keyof Member>("name");
  const [sortAscending, setSortAscending] = useState(true);

  // Form States for Registering Member
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberShares, setNewMemberShares] = useState("");
  const [newMemberSavings, setNewMemberSavings] = useState("");

  // Totals for Share Capital calculations
  const totalSharesSum = members.reduce((sum, member) => sum + member.shares, 0);

  // Handle Sort Toggle
  const handleSort = (field: keyof Member) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(true);
    }
  };

  // Form submission handler
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMemberName || !newMemberEmail) return;

    const initials = newMemberName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);

    const randomIdNumber = Math.floor(1000 + Math.random() * 9000);
    const newId = `CO-${randomIdNumber}`;

    const newMember: Member = {
      id: newId,
      name: newMemberName,
      email: newMemberEmail,
      phone: newMemberPhone || "+1 (555) 000-0000",
      joined: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      shares: parseFloat(newMemberShares) || 0,
      savings: parseFloat(newMemberSavings) || 0,
      status: "Pending",
      avatar: initials || "MB"
    };

    setMembers([newMember, ...members]);

    // Reset Form & Close Modal
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberPhone("");
    setNewMemberShares("");
    setNewMemberSavings("");
    setIsModalOpen(false);
  };

  // Filtering & Sorting Operations
  const filteredMembers = members
    .filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "All" || member.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === "string") {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortAscending ? -1 : 1;
      if (valA > valB) return sortAscending ? 1 : -1;
      return 0;
    });

  return (
    <div className={styles.membersPage}>
      {/* Title Header */}
      <div className={styles.headerActions}>
        <div className={styles.titleArea}>
          <h2>Member Registry</h2>
          <p>Manage member profiles, share distributions, equity allocations, and status logs</p>
        </div>
        <button className={styles.addMemberBtn} onClick={() => setIsModalOpen(true)}>
          <UserPlus size={18} />
          <span>Register Member</span>
        </button>
      </div>

      {/* Filter and Control Panel */}
      <div className={styles.filterPanel}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by ID, Name, or Email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterControls}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Filter size={16} style={{ color: "var(--text-muted)" }} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.selectInput}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {/* Members Directory Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.membersTable}>
            <thead>
              <tr>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("name")}>
                  Member Profile <ArrowUpDown size={12} style={{ marginLeft: "4px" }} />
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("joined")}>
                  Joined Date <ArrowUpDown size={12} style={{ marginLeft: "4px" }} />
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("shares")}>
                  Share Capital ($) <ArrowUpDown size={12} style={{ marginLeft: "4px" }} />
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => handleSort("savings")}>
                  Savings Account ($) <ArrowUpDown size={12} style={{ marginLeft: "4px" }} />
                </th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => {
                  const sharePercentage = ((member.shares / totalSharesSum) * 100).toFixed(1);
                  return (
                    <tr key={member.id}>
                      <td>
                        <div className={styles.memberProfile}>
                          <div className={styles.avatar}>{member.avatar}</div>
                          <div className={styles.memberDetails}>
                            <span className={styles.memberName}>{member.name}</span>
                            <span className={styles.memberId}>{member.id}</span>
                          </div>
                        </div>
                      </td>
                      <td>{member.joined}</td>
                      <td>
                        <div className={styles.financialCell}>
                          <span className={styles.balanceText}>${member.shares.toLocaleString()}</span>
                          <span className={styles.percentageShare}>{sharePercentage}% Share Equity</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.balanceText}>${member.savings.toLocaleString()}</span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            member.status === "Active"
                              ? "badge-success"
                              : member.status === "Pending"
                              ? "badge-warning"
                              : "badge-danger"
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td>
                        <button className={styles.actionBtn}>
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                    No members match search query or filter selection
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog: Add Member Overlay */}
      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Register New Member</h3>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMember}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full Member Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Catherine de Medici"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. catherine@medici.coop"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Phone Contact</label>
                    <input
                      type="tel"
                      placeholder="e.g. +1 (555) 765-4321"
                      value={newMemberPhone}
                      onChange={(e) => setNewMemberPhone(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Share Capital Allocation ($)</label>
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={newMemberShares}
                      onChange={(e) => setNewMemberShares(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Initial Savings Account ($)</label>
                    <input
                      type="number"
                      placeholder="e.g. 2000"
                      value={newMemberSavings}
                      onChange={(e) => setNewMemberSavings(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Approve Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
