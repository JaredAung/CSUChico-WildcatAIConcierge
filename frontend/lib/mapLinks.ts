/**
 * Constructs Google Maps and Apple Maps direction URLs for a given destination.
 * Optionally includes the user's current location as the origin.
 */

export interface MapLinks {
  google: string
  apple: string
}

/**
 * Build Google Maps and Apple Maps direction links.
 *
 * @param destination - Human-readable destination name (e.g., "Meriam Library")
 * @param origin - Optional user coordinates to set as the trip origin
 * @returns Object with `google` and `apple` URL strings
 */
export function buildMapLinks(
  destination: string,
  origin?: { latitude: number; longitude: number } | null
): MapLinks {
  // If destination does not already contain "Chico" (case-insensitive), append ", Chico, CA"
  let finalDestination = destination
  if (!/chico/i.test(destination)) {
    finalDestination = `${destination}, Chico, CA`
  }

  // URL-encode the destination string
  const encoded = encodeURIComponent(finalDestination)

  // Construct base URLs
  let google = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
  let apple = `https://maps.apple.com/?daddr=${encoded}`

  // If origin is provided, append origin/saddr parameters
  if (origin) {
    google += `&origin=${origin.latitude},${origin.longitude}`
    apple += `&saddr=${origin.latitude},${origin.longitude}`
  }

  return { google, apple }
}
