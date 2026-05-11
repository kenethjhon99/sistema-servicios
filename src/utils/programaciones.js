const parseIsoDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

export const calcularSiguienteFechaProgramacion = (fechaBase, frecuencia) => {
  const baseDate = parseIsoDate(fechaBase);
  if (!baseDate || !frecuencia) {
    return null;
  }

  switch (String(frecuencia).toUpperCase()) {
    case "SEMANAL":
      return formatIsoDate(addDays(baseDate, 7));
    case "QUINCENAL":
      return formatIsoDate(addDays(baseDate, 14));
    case "MENSUAL":
      return formatIsoDate(addMonths(baseDate, 1));
    case "UNICA":
    default:
      return formatIsoDate(baseDate);
  }
};
