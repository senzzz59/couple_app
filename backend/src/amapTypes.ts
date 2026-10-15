export interface AmapPhoto { url: string; title: string }
export interface AmapPlace {
  id: string;
  name: string;
  address: string;
  city: string;
  cityCode: string;
  lat: number | null;
  lng: number | null;
  category: string;
  rating: number | null;
  price: number | null;
  hours: string;
  phone: string;
  photos: AmapPhoto[];
}
export interface AmapDetails {
  place: AmapPlace | null;
  checkedAt: string;
  message?: string;
}
export type TravelMode = 'walking' | 'cycling' | 'driving' | 'transit';
export interface TravelOption {
  mode: TravelMode;
  seconds: number | null;
  meters: number | null;
  message?: string;
}
export interface AmapJourney { options: TravelOption[]; checkedAt: string }
