declare module 'lunar-javascript' {
  interface LunarDate {
    getYear(): number;
    /** 闰月为负数 */
    getMonth(): number;
    getDay(): number;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getSolar(): SolarDate;
  }
  interface SolarDate {
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getLunar(): LunarDate;
    toYmd(): string;
  }
  export const Lunar: { fromYmd(y: number, m: number, d: number): LunarDate };
  export const Solar: { fromYmd(y: number, m: number, d: number): SolarDate };
}
