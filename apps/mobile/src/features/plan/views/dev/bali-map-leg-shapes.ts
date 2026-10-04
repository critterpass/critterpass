/**
 * The road each leg of the Bali week on the MAP tab (bali-plan.ts) follows in the lab, so its map
 * draws along the streets as a synced plan does: routes from the public Valhalla (valhalla1.openstreetmap.de, OpenStreetMap
 * data, ODbL) between the fixture's own places, on foot for a hop of 1.2 km or less and by car
 * otherwise, simplified and encoded exactly as the legs job stores `plan_legs.shape`
 * (5 m tolerance, at most 200 points, precision 5). Keyed `from>to` as stored legs are.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { legPathsByPair, type LegPaths } from '@/data/legs/version-leg-paths';

export const BALI_MAP_LEG_PATHS: LegPaths = legPathsByPair([
  {
    from_key: '0199b000-0000-7000-8000-000000000101',
    to_key: '0199b000-0000-7000-8000-000000000102',
    shape:
      'hekt@sl|}TcDFqAiy@x@mA?Wy@BCh@gDDFyBnCyEDwPdAgGMy@_AaA]gBJmBz@eACqFLoFc@kDoAsFg@qGHwGbA{J?{CZcIM_Ao@m@_@GeIk@yFq@wGiBeGsDaE}EoA}B{AuEuJkq@mAgGw@sC}@uAgAgA{FgBmFgAqr@aKmBU}XoAwEc@n@yDJyBK{B]wA_\\op@cAuCc@iDAkBb@kLEkCa@oDwUu~@i@_BoBkDeOyPiBaEe@uEG}w@KoAq@iBiAqAcBw@gBQoHC_qALsFMk_@qBcCXkIbB{BRiBMyTcEuAXi]nPsLxEin@jKiENsCMes@oFm_@}BcCFcDh@kUxGsBaCuJgEgMi@y@U]w@MyB{@uDeAwHqDyDm@S}O|EaEdBec@~K_FfCiN~DiJbBeH|@aVjBqSl@wNt@aHJ}j@eB_c@kBu_@k@_Jc@sJoFq\\_BqDWwA_@e@c@?_CMi@mGEp@yHuCi@cC_BsEiAqOeCgQ}DeGcA}CD_P`BwEXcHEuLqAwQeAie@FgVQkXDiY}AaUcBc@e@McBu@i@eCF}FKcNTa_@vAyAJq@r@e@P}FWyAz@cCOyFyAkDSGV\\ZFp@W~GRtEeBhB]hByAw@kJ_CsRsCyCEyJkAwOoEmAxDqBg@',
  },
  {
    from_key: '0199b000-0000-7000-8000-000000000201',
    to_key: '0199b000-0000-7000-8000-000000000202',
    shape:
      'r~~r@unn~Ty@hEvCzBtLzAvAOp]VG_G]k@WkELm@j@s@@a@oEqKsB{IwPr@cBhAiGUmAx@cCOyFyAqDSAV\\ZFp@W~GRtEeBhB]hByAw@kJ_CsRsC_H[uG_AuNeEh@_B',
  },
  {
    from_key: '0199b000-0000-7000-8000-000000000301',
    to_key: '0199b000-0000-7000-8000-000000000302',
    shape:
      'dhnr@wjr~TxD{A`CSfCm@bDChI_AzHwBrXaAtRj@zPlAl]pEt@TxAtAn@Vff@dJlF`@dGFl]iA~Dk@|W{F`Z}A`l@dKpGtAvOjHZZl@lBj@ZrnB|ON^GxKyAhOwAbF~Ab@bJjAc@~FcAtASt@o@rGwOoEiG`S~Jl@jEDhJjBd@uE',
  },
  {
    from_key: '0199b000-0000-7000-8000-000000000302',
    to_key: '0199b000-0000-7000-8000-000000000303',
    shape: 'ne}r@csn~Te@tEiJkBkEE_Km@gApEiBrM?ZfA~Bg@~D_AnAuB`BIY',
  },
  {
    from_key: '0199b000-0000-7000-8000-000000000401',
    to_key: '0199b000-0000-7000-8000-000000000402',
    shape:
      '|h|r@}`o~TpBf@jKk[rB{QFiKl@g@nOlAzNhEtTlDzPlBtQ`@`@uQYeMuD_\\sA{c@xAcHmAuFX{FjBgED}Er@oB`@uF[m@cZ_C}Tq@oYQyCZ}cAf@_AZ}E~GsXG_DOqS_FeJgAwVaGiPzF_AhCTpBo@PgRaEsETa_@kG_C@mPyA}D{Aml@s\\_KwHaIcE_DwEaAiFcJiG_IsIaNmHqTuEgCwDqAFaEnEwE|BoPzA__@lIsdBiM^oFIoCw@kAcE}Bc@sAAsDmAkB^wAo@}JtAoI_@}AkZmFaKgCc_@iP}V_Jsc@mT}DqCyD_EoOsJyKkIss@eOo\\gDkEy@uGyCaNaJ}SsIwCcFYoDw@cAwUkCqF}IwAiAkUhBsSpCkXjEiJvBo{@lFuIR{SW}p@eHaDe@_J{CgNgDmVaDcn@kU}SmLgPeEmk@oSsDgGeFoB_UcFgTwOgCkIgEkC}HaAoHE{DtGe@rBMs@xAuG|@mJsCdCiAZkIwJa@BsAxB{@G`CcJHeJv@aBi@@qFhEa@@_DkDeCuI~AiG~BgD}BwIlAJ`BzBfBEp@kAOwEsBeM[[bD_ElB_Eh@wDNaInB}G`@k@tAMhBmCvJ_DzIsIxH_MiAs@fAeF`AeKF}IoBmHeBcK}CiFuDwDcAqE_BiC',
  },
  {
    from_key: '0199b000-0000-7000-8000-000000000701',
    to_key: '0199b000-0000-7000-8000-000000000702',
    shape:
      'vwxt@cjm}Ta@eAv@m@h@qAxBqM~@b@nAH`FdAfEVDVgChD?VbDxAn@|@vELJvArCl@b@MPYj@cCjBkDh@_@vBm@`ACtBd@lCpBfDh@RNr@`BoAxGTFrAo@rF`BhCXYnC~GbB?Pi@f@k@@',
  },
]);
