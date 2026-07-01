"use client";

import React, { useState } from "react";
import styles from "../../../app/governance.module.css";
import {
  Vote,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  ThumbsUp,
  ThumbsDown,
  Info,
  ShieldAlert,
  Users
} from "lucide-react";

interface Resolution {
  id: number;
  title: string;
  proposer: string;
  dateProposed: string;
  description: string;
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  userVoted: "yes" | "no" | "abstain" | null;
}

export default function Governance() {
  // Meetings Data
  const meetings = [
    {
      id: 1,
      month: "Jul",
      day: "12",
      title: "Annual General Assembly (AGM)",
      time: "10:00 AM - 1:00 PM",
      location: "Main Cooperative Hall & Zoom",
      quorum: "Quorum target: 75%"
    },
    {
      id: 2,
      month: "Jul",
      day: "28",
      title: "Fiscal Credit Committee Review",
      time: "2:00 PM - 4:00 PM",
      location: "Admin Boardroom",
      quorum: "Internal Review"
    },
    {
      id: 3,
      month: "Aug",
      day: "15",
      title: "Agricultural Sub-Committee AGM",
      time: "11:00 AM - 1:00 PM",
      location: "North Storage Annex",
      quorum: "Quorum target: 50%"
    }
  ];

  // Resolutions stateful array for live simulation
  const [resolutions, setResolutions] = useState<Resolution[]>([
    {
      id: 1,
      title: "Q3 Dividend Payout Rate Adjustment",
      proposer: "Board of Directors",
      dateProposed: "Jun 20, 2026",
      description:
        "Proposal to adjust the cooperative share dividend payout rate from 3.2% to 3.5% p.a. for the third quarter of fiscal year 2026. This increase is supported by our stronger-than-expected cash reserves and low delinquency rates in the agricultural credit sector, returning more value to members.",
      yesVotes: 32,
      noVotes: 8,
      abstainVotes: 2,
      userVoted: null
    },
    {
      id: 2,
      title: "Emergency Grain Storage Silo Repair Fund",
      proposer: "Facilities Sub-Committee",
      dateProposed: "Jun 25, 2026",
      description:
        "Authorize an emergency allocation of $50,000 from the cooperative general development reserve fund to finance immediate structural reinforcement and moisture-proofing of Storage Silos 3 & 4. Urgent action is required to secure the current harvest stockpile ahead of the autumn rain season.",
      yesVotes: 18,
      noVotes: 3,
      abstainVotes: 0,
      userVoted: null
    }
  ]);

  const totalMembers = 50; // Quorum cap base

  // Vote handler
  const castVote = (resId: number, type: "yes" | "no" | "abstain") => {
    setResolutions(
      resolutions.map((res) => {
        if (res.id === resId && res.userVoted === null) {
          return {
            ...res,
            yesVotes: type === "yes" ? res.yesVotes + 1 : res.yesVotes,
            noVotes: type === "no" ? res.noVotes + 1 : res.noVotes,
            abstainVotes: type === "abstain" ? res.abstainVotes + 1 : res.abstainVotes,
            userVoted: type
          };
        }
        return res;
      })
    );
  };

  return (
    <div className={styles.governancePage}>
      {/* Title */}
      <div className={styles.titleArea}>
        <h2>Governance & Voting Room</h2>
        <p>Participate in democratic sessions, review upcoming assemblies, and register votes on active resolutions</p>
      </div>

      {/* Assembly Schedule Cards */}
      <h3 style={{ fontSize: "1.1rem", marginBottom: "16px", color: "var(--text-primary)" }}>
        Upcoming Cooperative Assemblies
      </h3>
      <div className={styles.meetingGrid}>
        {meetings.map((meeting) => (
          <div key={meeting.id} className={styles.meetingCard}>
            <div className={styles.dateWidget}>
              <span className={styles.dateMonth}>{meeting.month}</span>
              <span className={styles.dateDay}>{meeting.day}</span>
            </div>
            <div className={styles.meetingDetails}>
              <span className={styles.meetingTitle}>{meeting.title}</span>
              <span className={styles.meetingMeta}>
                <Clock size={12} /> {meeting.time}
              </span>
              <span className={styles.meetingMeta} style={{ marginTop: "2px" }}>
                <MapPin size={12} /> {meeting.location}
              </span>
              <span className={styles.meetingMeta} style={{ marginTop: "4px", color: "var(--accent)", fontWeight: 600 }}>
                {meeting.quorum}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Active Resolutions Deck */}
      <div className={styles.resolutionsSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Vote size={18} style={{ color: "var(--primary)" }} />
            <span>Active Board Resolutions Awaiting Quorum</span>
          </h3>
        </div>

        <div className={styles.resGrid}>
          {resolutions.map((res) => {
            const totalVotes = res.yesVotes + res.noVotes + res.abstainVotes;
            const quorumPercent = Math.round((totalVotes / totalMembers) * 100);
            
            const yesPercent = totalVotes > 0 ? Math.round((res.yesVotes / totalVotes) * 100) : 0;
            const noPercent = totalVotes > 0 ? Math.round((res.noVotes / totalVotes) * 100) : 0;
            const abstainPercent = totalVotes > 0 ? Math.round((res.abstainVotes / totalVotes) * 100) : 0;

            const isQuorumReached = quorumPercent >= 75;

            return (
              <div key={res.id} className={styles.resCard}>
                <div className={styles.resHeader}>
                  <h4 className={styles.resTitle}>{res.title}</h4>
                  <span className={`badge ${isQuorumReached ? "badge-success" : "badge-warning"}`}>
                    {isQuorumReached ? "Quorum Ready" : "Voting"}
                  </span>
                </div>

                <div className={styles.resMeta}>
                  Proposed by <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{res.proposer}</span> on {res.dateProposed}
                </div>

                <p className={styles.resBody}>{res.description}</p>

                {/* Progress bars for votes */}
                <div className={styles.voteProgressPanel}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                    <span>Quorum Turnout ({totalVotes} / {totalMembers} Members)</span>
                    <span style={{ color: isQuorumReached ? "var(--success)" : "var(--accent)" }}>{quorumPercent}% Turnout</span>
                  </div>

                  <div className={styles.voteRow}>
                    <div className={styles.voteLabelRow}>
                      <span>YES ({res.yesVotes} Votes)</span>
                      <span>{yesPercent}%</span>
                    </div>
                    <div className={styles.voteBar}>
                      <div className={styles.voteFillYes} style={{ width: `${yesPercent}%` }} />
                    </div>
                  </div>

                  <div className={styles.voteRow}>
                    <div className={styles.voteLabelRow}>
                      <span>NO ({res.noVotes} Votes)</span>
                      <span>{noPercent}%</span>
                    </div>
                    <div className={styles.voteBar}>
                      <div className={styles.voteFillNo} style={{ width: `${noPercent}%` }} />
                    </div>
                  </div>

                  <div className={styles.voteRow}>
                    <div className={styles.voteLabelRow}>
                      <span>ABSTAIN ({res.abstainVotes} Votes)</span>
                      <span>{abstainPercent}%</span>
                    </div>
                    <div className={styles.voteBar}>
                      <div className={styles.voteFillAbstain} style={{ width: `${abstainPercent}%` }} />
                    </div>
                  </div>
                </div>

                {/* Casting button options */}
                {res.userVoted === null ? (
                  <div className={styles.castVoteRow}>
                    <button
                      onClick={() => castVote(res.id, "yes")}
                      className={`${styles.voteBtn} ${styles.voteBtnYes}`}
                    >
                      <ThumbsUp size={14} />
                      <span>Vote YES</span>
                    </button>
                    <button
                      onClick={() => castVote(res.id, "no")}
                      className={`${styles.voteBtn} ${styles.voteBtnNo}`}
                    >
                      <ThumbsDown size={14} />
                      <span>Vote NO</span>
                    </button>
                  </div>
                ) : (
                  <div className={styles.votedIndicator}>
                    <CheckCircle size={16} />
                    <span>Your vote ({res.userVoted.toUpperCase()}) was recorded securely</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
