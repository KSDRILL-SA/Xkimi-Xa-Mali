export interface SaBank {
  name: string
  universalBranchCode: string
}

export const SA_BANKS: readonly SaBank[] = [
  { name: 'Absa Bank',                    universalBranchCode: '632005' },
  { name: 'African Bank',                 universalBranchCode: '430000' },
  { name: 'Capitec Bank',                 universalBranchCode: '470010' },
  { name: 'Discovery Bank',               universalBranchCode: '679000' },
  { name: 'First National Bank (FNB)',    universalBranchCode: '250655' },
  { name: 'Investec Bank',                universalBranchCode: '580105' },
  { name: 'Nedbank',                      universalBranchCode: '198765' },
  { name: 'Standard Bank',               universalBranchCode: '051001' },
  { name: 'TymeBank',                     universalBranchCode: '678910' },
  { name: 'Bidvest Bank',                 universalBranchCode: '462005' },
  { name: 'Sasfin Bank',                  universalBranchCode: '683000' },
  { name: 'Bank Zero',                    universalBranchCode: '888000' },
] as const

const BANK_NAMES = new Set(SA_BANKS.map((b) => b.name))

export function isValidBankName(name: string): boolean {
  return BANK_NAMES.has(name)
}

export function getUniversalBranchCode(bankName: string): string | undefined {
  return SA_BANKS.find((b) => b.name === bankName)?.universalBranchCode
}

export function isValidAccountNumberFormat(accountNumber: string): boolean {
  return /^\d{6,12}$/.test(accountNumber)
}

export function isValidBranchCode(branchCode: string): boolean {
  return /^\d{6}$/.test(branchCode)
}
