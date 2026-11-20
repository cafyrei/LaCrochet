// Lalamove's rider status, in plain words.
export const RIDER_STATUS = {
  ASSIGNING_DRIVER: "Finding a rider",
  ON_GOING: "Rider is heading to the shop",
  PICKED_UP: "Rider has the parcel",
  COMPLETED: "Delivered",
  CANCELED: "Rider booking cancelled",
  REJECTED: "Rider booking declined",
  EXPIRED: "No rider was found",
};

// A rider is on the job (worth showing the live tracking link).
export const riderActive = (status) => ["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"].includes(status);

export const riderStatusText = (status) => RIDER_STATUS[status] ?? status ?? "";
