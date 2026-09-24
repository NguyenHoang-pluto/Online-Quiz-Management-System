/**
 * Kiểm tra một địa chỉ IPv4 có thuộc dải CIDR hay không.
 * Dùng cho ràng buộc "chỉ được thi từ dải mạng phòng máy" ở chế độ LAB.
 */

function ipv4ToInt(ip: string): number | null {
  // Bỏ tiền tố IPv6-mapped mà Node hay trả về: ::ffff:10.20.30.40
  const clean = ip.replace(/^::ffff:/i, '');
  const parts = clean.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) + n;
  }
  return result >>> 0;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  if (bits === 0) return true;
  const mask = (-1 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** Đúng nếu IP thuộc ít nhất một dải. Danh sách rỗng nghĩa là không ràng buộc. */
export function isIpAllowed(ip: string | undefined, cidrs: string[]): boolean {
  if (cidrs.length === 0) return true;
  if (!ip) return false;
  return cidrs.some((c) => isIpInCidr(ip, c));
}
