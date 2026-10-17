// Presentation only: describes the existing selected flags without changing the draft.
export function eventSettlementOptionsView({ roundSettlementTransfers, directSettlementTransfers }) {
  return {
    rounding: {
      label: "עיגול ההעברות",
      valueLabel: roundSettlementTransfers ? "סכומים שלמים" : "דיוק מלא",
      action: "new-event-rounding-choice",
      selectedValue: roundSettlementTransfers ? "rounded" : "exact",
      options: [{ value: "rounded", label: "סכומים שלמים" }, { value: "exact", label: "דיוק מלא" }],
      hint: roundSettlementTransfers
        ? "מעגלים את ההעברות ומאזנים את ההפרש. ההוצאות נשארות מדויקות."
        : "ההעברות נשארות מדויקות, ללא עיגול."
    },
    repayment: {
      label: "חלוקת ההחזרים",
      valueLabel: directSettlementTransfers ? "החזר למי ששילם" : "פחות העברות",
      action: "new-event-repayment-choice",
      selectedValue: directSettlementTransfers ? "direct" : "optimized",
      options: [{ value: "direct", label: "החזר למי ששילם" }, { value: "optimized", label: "פחות העברות" }],
      hint: directSettlementTransfers
        ? "כל משתתף מחזיר למי ששילם עבורו."
        : "מצמצמים העברות בין המשתתפים. ההחזר עשוי להיות למשתתף אחר ממי ששילם עבורכם."
    }
  };
}
