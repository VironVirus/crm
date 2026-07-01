import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  formatReportDate,
  formatReportNaira,
  type MemberStatementData,
} from "@/lib/reports";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingBottom: 28,
    paddingHorizontal: 28,
    paddingTop: 26,
  },
  header: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 18,
    color: "#ffffff",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  logoPlaceholder: {
    alignItems: "center",
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    color: "#0f172a",
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  logoText: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  brandBlock: {
    flexGrow: 1,
    paddingHorizontal: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 10,
    marginTop: 4,
  },
  statementMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  statementMetaLabel: {
    color: "#fcd34d",
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statementMetaValue: {
    fontSize: 10,
    fontWeight: 600,
  },
  section: {
    backgroundColor: "#ffffff",
    border: "1 solid #e2e8f0",
    borderRadius: 16,
    marginBottom: 14,
    padding: 14,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 10,
  },
  memberGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  memberCard: {
    backgroundColor: "#f8fafc",
    border: "1 solid #e2e8f0",
    borderRadius: 12,
    minHeight: 54,
    padding: 10,
    width: "48%",
  },
  label: {
    color: "#64748b",
    fontSize: 8,
    letterSpacing: 0.6,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  value: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: 600,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    backgroundColor: "#f8fafc",
    border: "1 solid #e2e8f0",
    borderRadius: 12,
    flexGrow: 1,
    padding: 10,
  },
  table: {
    border: "1 solid #e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHead: {
    backgroundColor: "#e2e8f0",
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tableRow: {
    borderTop: "1 solid #e2e8f0",
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerCell: {
    color: "#334155",
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  cell: {
    color: "#0f172a",
    fontSize: 9,
    lineHeight: 1.35,
  },
  emptyState: {
    color: "#64748b",
    fontSize: 9,
    fontStyle: "italic",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  footer: {
    color: "#64748b",
    fontSize: 8,
    marginTop: 6,
    textAlign: "center",
  },
});

function formatAccountTypeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTransactionTypeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderTableRow({
  cells,
  widths,
}: {
  cells: Array<string | null | undefined>;
  widths: string[];
}) {
  return (
    <View style={styles.tableRow}>
      {cells.map((cell, index) => (
        <View key={`${cell ?? "empty"}-${index}`} style={{ width: widths[index] }}>
          <Text style={styles.cell}>{cell && cell.length > 0 ? cell : "—"}</Text>
        </View>
      ))}
    </View>
  );
}

export function MemberStatementDocument({
  statement,
}: {
  statement: MemberStatementData;
}) {
  return (
    <Document
      author="Ifemelumma Cooperative Society"
      subject="Member statement"
      title={`${statement.member.fullName} Member Statement`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>Logo</Text>
          </View>

          <View style={styles.brandBlock}>
            <Text style={styles.title}>Ifemelumma Cooperative Society</Text>
            <Text style={styles.subtitle}>
              Member statement covering savings, loans, shares, and dividends
            </Text>
          </View>

          <View style={styles.statementMeta}>
            <Text style={styles.statementMetaLabel}>Statement period</Text>
            <Text style={styles.statementMetaValue}>
              {formatReportDate(statement.period.startDate)} -{" "}
              {formatReportDate(statement.period.endDate)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Member Details</Text>
          <View style={styles.memberGrid}>
            {[
              ["Full name", statement.member.fullName],
              ["Member number", statement.member.memberNumber ?? "Not assigned"],
              ["Email", statement.member.email],
              ["Phone", statement.member.phone ?? "No phone on file"],
              ["Date of birth", formatReportDate(statement.member.dateOfBirth)],
              ["Status", statement.member.status],
              ["Occupation", statement.member.occupation],
              ["Address", statement.member.address],
            ].map(([label, value]) => (
              <View key={label} style={styles.memberCard}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Share Holdings Snapshot</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.label}>Current total shares</Text>
              <Text style={styles.value}>
                {statement.shareHoldings.totalShares.toLocaleString("en-NG")}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.label}>Current share value</Text>
              <Text style={styles.value}>
                {formatReportNaira(statement.shareHoldings.totalValue)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Savings Transactions</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              {[
                ["Date", "16%"],
                ["Account", "18%"],
                ["Type", "14%"],
                ["Reference", "20%"],
                ["Amount", "14%"],
                ["Balance", "18%"],
              ].map(([label, width]) => (
                <View key={label} style={{ width }}>
                  <Text style={styles.headerCell}>{label}</Text>
                </View>
              ))}
            </View>
            {statement.savingsTransactions.length > 0 ? (
              statement.savingsTransactions.map((transaction) =>
                renderTableRow({
                  cells: [
                    formatReportDate(transaction.transactionDate),
                    formatAccountTypeLabel(transaction.accountType),
                    formatTransactionTypeLabel(transaction.transactionType),
                    transaction.paymentReference,
                    formatReportNaira(transaction.amount),
                    formatReportNaira(transaction.balanceAfter),
                  ],
                  widths: ["16%", "18%", "14%", "20%", "14%", "18%"],
                }),
              )
            ) : (
              <Text style={styles.emptyState}>
                No savings transactions were recorded in this period.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Loan Repayment History</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              {[
                ["Date", "18%"],
                ["Loan product", "30%"],
                ["Reference", "22%"],
                ["Amount", "15%"],
                ["Outstanding", "15%"],
              ].map(([label, width]) => (
                <View key={label} style={{ width }}>
                  <Text style={styles.headerCell}>{label}</Text>
                </View>
              ))}
            </View>
            {statement.loanRepayments.length > 0 ? (
              statement.loanRepayments.map((repayment) =>
                renderTableRow({
                  cells: [
                    formatReportDate(repayment.transactionDate),
                    repayment.loanProductName,
                    repayment.paymentReference,
                    formatReportNaira(repayment.amount),
                    formatReportNaira(repayment.outstandingBalance),
                  ],
                  widths: ["18%", "30%", "22%", "15%", "15%"],
                }),
              )
            ) : (
              <Text style={styles.emptyState}>
                No loan repayment entries were recorded in this period.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dividends Received</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              {[
                ["Year", "18%"],
                ["Shares", "14%"],
                ["Amount", "18%"],
                ["Paid date", "20%"],
                ["Reference", "18%"],
                ["Status", "12%"],
              ].map(([label, width]) => (
                <View key={label} style={{ width }}>
                  <Text style={styles.headerCell}>{label}</Text>
                </View>
              ))}
            </View>
            {statement.dividends.length > 0 ? (
              statement.dividends.map((dividend) =>
                renderTableRow({
                  cells: [
                    dividend.financialYear,
                    dividend.sharesAtDeclaration.toString(),
                    formatReportNaira(dividend.dividendAmount),
                    formatReportDate(dividend.paidAt),
                    dividend.paymentReference,
                    dividend.status,
                  ],
                  widths: ["18%", "14%", "18%", "20%", "18%", "12%"],
                }),
              )
            ) : (
              <Text style={styles.emptyState}>
                No dividends were marked as received in this period.
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by Ifemelumma Cooperative Society administrative reporting
          module.
        </Text>
      </Page>
    </Document>
  );
}
