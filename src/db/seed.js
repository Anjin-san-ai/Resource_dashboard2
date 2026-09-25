// Default seed data used to initialize the mock database on first run.
// IDs are stable, human-readable strings so relationships are easy to trace.

export const SEED_OPTYS = [
  {
    id: 'opty-001',
    name: 'Atlas CRM Modernization',
    status: 'Active',
    client: 'Northwind Traders',
    budget: 420000,
    start_date: '2026-01-15',
    end_date: '2026-09-30',
  },
  {
    id: 'opty-002',
    name: 'Helios Mobile Banking App',
    status: 'Active',
    client: 'Meridian Financial',
    budget: 680000,
    start_date: '2026-03-01',
    end_date: '2026-12-15',
  },
  {
    id: 'opty-003',
    name: 'Orion Data Warehouse',
    status: 'Pipeline',
    client: 'Vertex Logistics',
    budget: 310000,
    start_date: '2026-06-01',
    end_date: '2027-02-28',
  },
  {
    id: 'opty-004',
    name: 'Nimbus E-Commerce Replatform',
    status: 'On Hold',
    client: 'Cascade Retail Group',
    budget: 255000,
    start_date: '2026-02-10',
    end_date: '2026-08-20',
  },
  {
    id: 'opty-005',
    name: 'Sentinel Security Audit',
    status: 'Completed',
    client: 'Bluepeak Insurance',
    budget: 95000,
    start_date: '2025-10-01',
    end_date: '2026-01-31',
  },
]

export const SEED_RESOURCES = [
  { id: 'res-001', name: 'Ava Thompson', role: 'Project Manager', email: 'ava.thompson@acme.com', max_hours: 40 },
  { id: 'res-002', name: 'Liam Chen', role: 'Developer', email: 'liam.chen@acme.com', max_hours: 40 },
  { id: 'res-003', name: 'Sofia Martinez', role: 'Developer', email: 'sofia.martinez@acme.com', max_hours: 40 },
  { id: 'res-004', name: 'Noah Patel', role: 'Designer', email: 'noah.patel@acme.com', max_hours: 32 },
  { id: 'res-005', name: 'Emma Johnson', role: 'QA Specialist', email: 'emma.johnson@acme.com', max_hours: 40 },
  { id: 'res-006', name: 'Oliver Kim', role: 'Developer', email: 'oliver.kim@acme.com', max_hours: 40 },
  { id: 'res-007', name: 'Mia Rossi', role: 'Designer', email: 'mia.rossi@acme.com', max_hours: 24 },
  { id: 'res-008', name: 'Lucas Nguyen', role: 'Project Manager', email: 'lucas.nguyen@acme.com', max_hours: 40 },
]

export const SEED_ALLOCATIONS = [
  { id: 'alloc-001', opty_id: 'opty-001', resource_id: 'res-001', hours_allocated: 12, role_on_project: 'Project Manager' },
  { id: 'alloc-002', opty_id: 'opty-001', resource_id: 'res-002', hours_allocated: 24, role_on_project: 'Lead Developer' },
  { id: 'alloc-003', opty_id: 'opty-001', resource_id: 'res-005', hours_allocated: 16, role_on_project: 'QA Specialist' },
  { id: 'alloc-004', opty_id: 'opty-002', resource_id: 'res-008', hours_allocated: 20, role_on_project: 'Project Manager' },
  { id: 'alloc-005', opty_id: 'opty-002', resource_id: 'res-003', hours_allocated: 30, role_on_project: 'Developer' },
  { id: 'alloc-006', opty_id: 'opty-002', resource_id: 'res-006', hours_allocated: 28, role_on_project: 'Developer' },
  { id: 'alloc-007', opty_id: 'opty-002', resource_id: 'res-004', hours_allocated: 18, role_on_project: 'UX Designer' },
  { id: 'alloc-008', opty_id: 'opty-003', resource_id: 'res-002', hours_allocated: 10, role_on_project: 'Developer' },
  { id: 'alloc-009', opty_id: 'opty-004', resource_id: 'res-007', hours_allocated: 12, role_on_project: 'Designer' },
  { id: 'alloc-010', opty_id: 'opty-004', resource_id: 'res-005', hours_allocated: 20, role_on_project: 'QA Specialist' },
]

export const OPTY_STATUSES = ['Pipeline', 'Active', 'Completed', 'On Hold']
export const RESOURCE_ROLES = ['Developer', 'Designer', 'Project Manager', 'QA Specialist']
