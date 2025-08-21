// Mock next/navigation for testing

// Mock useRouter hook
const useRouter = jest.fn().mockReturnValue({
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  pathname: '/',
  query: {},
  asPath: '/'
});

// Mock useSearchParams hook  
const useSearchParams = jest.fn().mockReturnValue({
  get: jest.fn().mockReturnValue(null),
  getAll: jest.fn().mockReturnValue([]),
  has: jest.fn().mockReturnValue(false),
  keys: jest.fn().mockReturnValue([]),
  values: jest.fn().mockReturnValue([]),
  entries: jest.fn().mockReturnValue([]),
  toString: jest.fn().mockReturnValue('')
});

// Mock usePathname hook
const usePathname = jest.fn().mockReturnValue('/');

// Mock redirect function
const redirect = jest.fn();

// Mock notFound function  
const notFound = jest.fn();

module.exports = {
  useRouter,
  useSearchParams,
  usePathname,
  redirect,
  notFound
};