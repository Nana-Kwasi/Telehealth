import { geocodeAddressWeb, getBrowserCoords, reverseGeocodeWeb } from '../utils/homeCareGeo';

export async function getCurrentLocationMobile() {
  return getBrowserCoords();
}

export async function geocodeAddressMobile(address) {
  return geocodeAddressWeb(address);
}

export async function reverseGeocodeMobile(latitude, longitude) {
  return reverseGeocodeWeb(latitude, longitude);
}
