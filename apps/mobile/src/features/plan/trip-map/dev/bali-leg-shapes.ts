/**
 * The road each leg of the Bali Six's days (bali-trip.ts) follows in the lab, so its maps draw
 * along the streets as a synced plan does: routes from the public Valhalla (valhalla1.openstreetmap.de, OpenStreetMap
 * data, ODbL) between the fixture's own places, on foot for a hop of 1.2 km or less and by car
 * otherwise, simplified and encoded exactly as the legs job stores `plan_legs.shape`
 * (5 m tolerance, at most 200 points, precision 5). Keyed `from>to` as stored legs are.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { legPathsByPair, type LegPaths } from '@/data/legs/version-leg-paths';

export const LAB_LEG_PATHS: LegPaths = legPathsByPair([
  {
    from_key: 'stay',
    to_key: '0199c000-0000-7000-8000-000000000101',
    shape:
      '`b~r@min~TFe@w@MuCHmF]mKH_NmCkEE_Km@lBsGzKm\\~Ab@z^|EnCJfHv@|FRhCd@nDHpBXvDfAbCNxA{@|FVd@Qp@s@xAKp^wArNU|FJ~AIt@DZRN\\FvAb@d@`UbBhY|AjXEfVPhe@GvQdAtLpAbHDvEYvPcB|CAtX~FpOdCrEhAbC~AtCh@q@xHlGDLh@?~Bd@b@vA^pDVp\\~ArJnF~Ib@t_@j@zx@bD~Od@vAShAZ`HKvNu@pSm@`VkBdH}@hJcBhN_E~EgCdc@_L`EeB|O}El@RpDxDdAvHz@tDLxBd@~@nNt@xKpEhBpAt@IhTgGnUyJlB_@tG[dBN^Nh@p@Nz@FbHl@nAbAd@lr@bFvFKdm@eKxI_Djb@gSn@OtQpDnEf@`BKhKwBdBOzCF~YnBxEHxxAKlBDhBVnAj@pArAp@~ARpAJrx@`@tEdBxDfO`QjAhBtAfDnUp~@h@`G?hCe@`JBjB`@~CxBtFfZ`m@`@hBPxBo@jH~Ed@|VdAdGd@rCt@hj@bIvMv@nA`@|@rA^lBhCdPdIdl@pAdFlB`EhB`CfC~BpEhCxC`AlFh@|ABjAKt@a@vBqCzAq@h@?bAZl@dAHl@AfEw@xQgA|JGrGj@jGhBxJErNFTx@\\^l@Nr@AbBaApBO|By@dEIhQuCfFE|RpBCAcB~@C|@lm@bDG',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000101',
    to_key: '0199c000-0000-7000-8000-000000000103',
    shape:
      'hekt@sl|}TcDFqAiy@x@mA?Wy@BCh@gDDFyBnCyEDwPdAgGMy@_AaA]gBJmBz@eACqFLoFc@kDoAsFg@qGHwGbA{J?{CZcIM_Ao@m@_@GeIk@yFq@wGiBeGsDaE}EoA}B{AuEuJkq@mAgGw@sC}@uAgAgA{FgBmFgAqr@aKmBU}XoAwEc@n@yDJyBK{B]wA_\\op@cAuCc@iDAkBb@kLEkCa@oDwUu~@i@_BoBkDeOyPiBaEe@uEG}w@KoAq@iBiAqAcBw@gBQoHC_qALsFMk_@qBcCXkIbB{BRiBMyTcEuAXi]nPsLxEin@jKiENsCMes@oFm_@}BcCFcDh@kUxGsBaCuJgEgMi@y@U]w@MyB{@uDeAwHqDyDm@S}O|EaEdBec@~K_FfCiN~DiJbBeH|@aVjBqSl@wNt@aHJ}j@eB_c@kBu_@k@_Jc@sJoFq\\_BqDWwA_@e@c@?_CMi@mGEp@yHuCi@cC_BsEiAqOeCgQ}DeGcA}CD_P`BwEXcHEuLqAwQeAie@FgVQkXDiY}AaUcBc@e@McBu@i@eCF}FKcNTa_@vAyAJq@r@e@P}FWyAz@cCOyFyAkDSGV\\ZFp@W~GRtEeBhB[hB{Aw@kJ_CsRsCyCEyJkAwOoEiG`S~Jl@jEDvNpCtJMlF\\tCIv@LE\\',
  },
  { from_key: '0199c000-0000-7000-8000-000000000103', to_key: 'stay', shape: 'bb~r@uin~TAF' },
  {
    from_key: 'stay',
    to_key: '0199c000-0000-7000-8000-000000000201',
    shape: '`b~r@min~TFe@w@MuCHmF]mKH_NmCkEE_Km@fQsi@p@eEf@wFkDMu[yCsFBiA[_CMwAc@y@AH_C',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000201',
    to_key: '0199c000-0000-7000-8000-000000000202',
    shape:
      'lg{r@sup~TI~Bx@@vAb@~BLhAZrFCZgDpCFl\\xCFyJl@g@nOlAzNhEtTlDzPlBtQ`@PfKhAzHV~F|H_@rBzInEpKA`@k@r@Ml@VjE\\j@B|K_SQMmCIGuHMwANuL{AwC{Bl@yC',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000202',
    to_key: '0199c000-0000-7000-8000-000000000203',
    shape:
      'f~~r@emn~Tm@xCvCzBtLzAvAOp]VG_G]k@WkELm@j@s@@a@oEqKsB{IwPr@cBhAiGUmAx@cCOyFyAqDSAV\\ZFp@W~GRtEeBhB]hByAw@kJ_CsRsCyCEyJkAkN{Dk@SzAkEgA_@',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000203',
    to_key: '0199c000-0000-7000-8000-000000000204',
    shape: 'po|r@{lo~TfA^`FeOp@eEvCh@vBL@S',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000204',
    to_key: 'stay',
    shape:
      '`c}r@m`p~TtGb@~LdBc@hDw^gD}@pC~Ab@bJjAc@~FcAtASt@o@rGwOoEiG`S~Jl@jED~MlClKIlF\\tCIv@LGd@',
  },
  {
    from_key: 'stay',
    to_key: '0199c000-0000-7000-8000-000000000301',
    shape:
      '`b~r@min~TFe@w@MqWI_NmCkQs@hOae@za@`Gn^fCpKnBf@?`Aw@hGTbBiAvPs@rBzInEpK{@xBVtE\\j@FjHCpBu@tBz@xBnCl@|@x@P|JuAtY{CtRWtKuAnGO`NoTSy@bPHjDO^cBf@G`@zAv@JrAtI`DnIxBtGz@xQzDr@d@yCh[{ELuGq@_R}DUfAkChW{AvF{Bt]q@xBeAGIpIiApLlUlDmDbRkxBeFo\\rAsKDaOjA_`AiCu^pGeKpEqJm@Y~McDhGiCdIgC|Bi@dFcAbCeAzGgAdDIbBd@|BCjSkB`]oT}BsAdJAxMeUqAiRiB_Xg@_HiA{mAka@oAaAg@aCu@m@gl@qUoLcD}WoEuCrJgCtS}VcByB`R}IXWhGeW{@aDhKeC|BkB`@Sr@vAjCCxAw@tGc@x@gAd@m@bCwAvMkd@xDgnA{IR~JsCbEeBHYlGqAbBgs@tBgRbBoF]qHDeL`EaDfBPnBa@f@gVpDy@~@kAR_Q^?bGs@`AcCpA{@hCQfCPb@`I~A~BzCfC|FEtFaD\\_CzBa@fAEzAxArCPdDaIxBiV|LBjH~A~CQ`Aci@dTxCzKp@~IvGl`@lGIlI|Cf@hAAjBoCbBqDtGwFnBQ`@rGlC_@tAsBhAdAjCbDNhCk@w@tAoBjAwBtN`G`KlB|EvBh@s@fEcAlBDn@hAFhCaChEyAlGr@xECbEuFtAy@',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000301',
    to_key: '0199c000-0000-7000-8000-000000000302',
    shape:
      'z{ar@_su}TuAx@cEtFyEBmGs@iExAiC`CiAGEo@bAmBr@gEwBi@mB}EaGaKvBuNnBkAv@uAiCj@cDOeAkCrBiA^uAsGmCPa@vFoBpDuGnCcB@kBg@iAmI}CmGHwGm`@q@_JyC{Kbi@eTPaA_B_DCkHhV}L`IyBQeDyAsCD{A`@gA~B{B`D]DuFgC}F_C{CaI_BQc@PgCz@iCbCqAr@aAGqQvCeFgBqMBgGb@s@`E{@t]yA`OoInRc@n[mBnNh@xIQ`P~@jRCplAvIhc@yDvAwMl@cCfAe@b@y@v@uGByAwAkCRs@jBa@dC}B`DiKdWz@ViG|IYxBaR|VbBfCuStCsJ|WnEnLbDfl@pUt@l@f@`CnA`AzmAja@~GhA~Wf@hRhBpUrAjFdBpI`G|Br@|@sJ_@cDB}KfCkb@BkS_@iErCaLAw@bAcCh@eFfC}BhCeIbDiGX_NpJl@dKqEt^qG~_AhC`OkArKEn\\sAjxBdFlDcRmUmDhAqLHqIdAFp@yBzBu]zAwFjCiWTgA~Q|DtGp@zEMtCw[iPyD_OcC{OmFKsAqAa@Ig@zBwAIkDx@cPqJIqk@mE{p@mLsQsEpCkM_DcAt@cCDwDvXW@{BoE?w@YOeGmB_AnAcVaFQmCj@~@oA^cCDeAeAqChBsMdCyJvImW',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000302',
    to_key: '0199c000-0000-7000-8000-000000000303',
    shape: 'hs|r@coo~TrBkG~Ab@bJjAc@~FcAtASt@o@rGwOoEkExMqChL}AbL?ZfA~Bs@pEs@|@{ErDqGPqFA',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000303',
    to_key: '0199c000-0000-7000-8000-000000000304',
    shape:
      '`i{r@whm~TmGYsTuBcR\\ea@qBuA@WRg@lG{AlMgQwDaAPk@GaU}EC_@PmAQeA]a@qIoABuAt@qFv@w@\\Kj@HhA~@`AI^SDUaAiATk@bD\\`LXhCa@^cADqEMuB[q@pTP\\Ej@q@jE}@~Ff@rB[vMfD`@mAdBy@NW',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000304',
    to_key: '0199c000-0000-7000-8000-000000000305',
    shape:
      'ptyr@_mn~TOVeBx@a@lAwMgDsBZ_Gg@kE|@k@p@]DqTQZp@LtBEpE_@bAiC`@aLYcD]Uj@`AhAET_@RaAHiA_Ak@I]Jw@v@u@pFCtApInA\\`@PdAQlAB^`U|Ej@F`AQfQvDzAmMf@mGVStAAda@pBbR]rTtBrETbPCr@Y`EaD~@oAf@_EgA_C?[hBsMnCmK`Me_@~Ab@z^|EnCJfHv@|FRhCd@hAp@DzAUtFRtEeBhB[hB{Aw@kJ_CaRoC',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000305',
    to_key: 'stay',
    shape: 'zp}r@i|n~TqH_@sFu@wOoEiG`S~Jl@jED~MlClKIlF\\tCIv@LGd@',
  },
  {
    from_key: 'stay',
    to_key: '0199c000-0000-7000-8000-000000000401',
    shape:
      '`b~r@min~TFe@w@MqWI_NmCkQs@`Rel@xAiOFiKl@g@nOlAzNhEtTlDzPlBtQ`@`@uQYeMuD_\\sA{c@xAcHmAuFX{FjBgED}Er@oB`@uF[m@cZ_C}Tq@oYQyCZ}cAf@_AZ}E~GsXG_DOqS_FeJgAwVaGiPzF_AhCTpBo@PgRaEsETa_@kGsSqAwEaBml@s\\_KwHaIcE_DwEaAiFcJiG_IsIaNmHqTuEgCwDqAFaEnEwE|BoPzA__@lIsdBiM^oFIoCw@kAcE}Bc@sAAsDmAkB^wAo@}JtAoI_@}AkZmFaKgCc_@iP}V_Jsc@mT}DqCyD_EoOsJyKkIss@eOo\\gDkEy@uGyCaNaJ}SsIwCcFYoDw@cAwUkCqF}IwAiAkUhBsSpCkXjEiJvBut@vEoPh@cWc@um@yGaDe@_J{CgNgDmVaDcn@kU}SmLgPeEmk@oS{@y@uAiDiC{A}X{GgTwOgCkIgEkC}HaAoHEoAzAuCjHGaAvAeG|@mJsCdCiAZkIwJa@BsAxB{@G`CcJHeJv@aBi@@qFhEa@@_DkDeCuI~AiG~BgD}BwIlAJ`BzBfBEp@kAC_DiCsOiDtBoALiAnDYrC_FdAgASeAqD_Fu@cC_CcCu@_BaDqCiB_AcCaFoBiE_G_E]_Ae@uDh@g@aJoFwF_CsAYoEcC_F{A|@JfD}@tD^xBuAx@j@nDyBvBcAxEwClDgXpEuDM[wB{@eB}ItBgCo@wCb@}MzGwHOsDlFc@sCqBwCi@fAP`EWfA}Ct@uBtC',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000401',
    to_key: '0199c000-0000-7000-8000-000000000402',
    shape:
      '`niq@gye_U^UTq@~@mA|Cu@VgAQaER{@TKpBvCb@rCrDmFr@?t@PbAShCPjBo@hCqBfFyBtAI`AYp@@tAl@dBu@vF_Az@dBZvBtDL~CY`FmApD]rFkA^s@vByBd@{C\\}@f@w@pA_Ak@oDtAy@_@yB|@uDKgD\\i@|@Sh@dBxAxBXnE~BrApAhB|ClCThDAnBRfARB`Dm@~@d@~D\\hE~F|BlAbAJ^Td@r@XnApChB~A`DbCt@vAjBj@RhBd@fAEl@Th@dCZj@fARrE}@^aADyAhAoDVO`ACvDyC`EeGv@gCVeCNaIjCgIzAOjAqBdAq@fG_BfAi@zCmD~DeD|EkHzAsCiAs@fAeF`AeKF}Iw@uDw@wBeBcKwBsCe@uAuDwDcAqE_BiC',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000402',
    to_key: 'stay',
    shape:
      'x|pq@oxj_U~AhCbApEtDvD|ChFdBbKnBlHG|IaAdKgAdFhAr@yH~L{IrIwJ~CiBlCuALa@j@oB|GO`Ii@vDmB~DcD~DZZrBdMNvEq@jAgBDaB{BmAK|BvI_CfD_BhGdCtI~CjD`@ApFiEh@Aw@`BIdJaCbJz@FrAyB`@CjIvJhA[rCeCoC~SvCuGnA{AnHD|H`AfEjCfCjIfTvO~TbFdFnBrDfGlk@nSfPdE|SlLbn@jUlV`DfNfD~IzC`Dd@|p@dHzSVtISn{@mFhJwBjXkErSqCjUiBvAhApF|IvUjCv@bAXnDvCbF|SrI`N`JtGxCjEx@n\\fDrs@dOxKjInOrJxD~D|DpCrc@lT|V~Ib_@hP`KfCjZlF^|AuAnIn@|J_@vAlAjB@rDb@rAbE|Bv@jAA`JTb@hcBbM~^mInP{AvE}B`EoEpAGfCvDpTtE`NlH~HrIbJhG`AhF~CvE`IbE~JvHll@r\\|DzAlPxA~BA`_@jGrEUfR`En@QUqB~@iChP{FvV`GdJfApS~E~CNrXF|E_H~@[|cAg@xC[nYP|Tp@bZ~BZl@a@tFs@nBE|EkBfEYzFlAtFyAbHrAzc@tD~[XdMa@tQuQa@{PmBuTmD{NiEoOmAm@f@GhKaAtKoBvIbMnBc@~FwAjCo@rGwOoEiG`SjQr@~MlCpWHv@LGd@',
  },
  {
    from_key: 'stay',
    to_key: '0199c000-0000-7000-8000-000000000501',
    shape:
      '`b~r@min~To@s@qWI_NmCkQs@`Rel@`Bs[l@g@nOlAzNhEtTlDzPlBtQ`@F{_@uD_\\sA{c@xAcHmAuF`@aH|AkCpBsR|K\\~@kXxA}@tQw@GuSlIyAtJsMZiJnGwD|Cs[qBiHxAuq@r@yHfDiJhW~@vBcAhAcC~B}u@qD}IoDm[_Iyd@~NmNrHqZf@eNhC}LbDic@iDmIPiBzRuEvJhAjAu@xGer@`Aw\\vCiLvEiFfByHnFiEm@uCqIoLd@w[hEm_@}Ek[PqFfJe]jGk]fDErDeQrN{\\nDGxCcBm[{y@kZu`@eByFHoIhQur@jAiRyBiaAgLaa@_DcToCsHqBsSw@wd@aZip@uQ_Kip@sViWwP}T]}Cj@{HdGeRt@kLqRnHgJbAqJpCcAlDfAvAa@z@aAYoFjFoF~G\\nG{BfECbS}LJuAp@TjEiIjEiPhuYsaGlB{@zAsEjAvAoA~JbGT~@`OnGlQfAb]tAg@tBcE~@bBv@wBvNrAlCvAn@uAjEEbPtCtE}@`Mj@zUmDxDPdE_AtF`@~GeBhEbA~B|CbNfEbFyBnJn@xQiBfB{EzEFrHqCrFqCdG_H`NLxBlE`Gz@`F_AUcCzAg@vGPhB`BfOJfFOhQkDfFdA',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000501',
    to_key: 'stay',
    shape:
      'prgt@{pf`UgFeAiQjDgFNgOKiBaBwGQ{Af@TbCaF~@aG{@yBmEaNMeG~GsFpCsHpC{EGgBzEyQhBoJo@cFxBcNgE_C}CiEcA_HdBuFa@eE~@yDQ{UlDaMk@uE|@cPuCkEDo@tAmCwAwNsAw@vB_AcBuBbEuAf@gAc]oGmQ_BeX}AsIsBK[`FmAfCmBz@iuYraGkEhPiGhKcS|LgEBoGzB_H]kFnFXnF{@`AwA`@mDgAqCbAcApJoHfJjLpRdRu@zHeG|Ck@|T\\hWvPhp@rVtQ~J`Zhp@v@vd@pBrSnCrHdCrQ|Mbg@vB|z@m@bR}Qru@OtIfBpF|Yd`@fZdx@xYn_@sOnEeXvLeTd@cJnf@sFnRm@bH|Eb\\wCxVwAhc@pIxLl@tCoFhEgBxHwEhFwChLaAv\\aHzr@cA^wJiAuFpBiHd@eBtAGpAhDlIcDhc@iC|Lg@dNsHpZ_OlN~Hxd@nDl[pD|IoC|{@g@h@q[kAiDrIs@xHyAtq@pBhH}Cr[oGvD[hJuJrMmIxAFtSuQv@yA|@aAnXaKm@i@d@aBxQeBpDYzFlAtFyAbHrAzc@tD~[Gz_@wUu@ob@gG{NiEoOmAm@f@s@hTeClMbMnBc@~FwAjCo@rGwOoEiG`SjQr@~MlCpWHn@r@',
  },
  {
    from_key: 'stay',
    to_key: '0199c000-0000-7000-8000-000000000701',
    shape:
      '`b~r@min~TFe@w@MqWI_NmCkQs@hOae@za@`Gn^fClLpBxA{@|FVvAeAxAKp^wApYSpAXVtBb@d@jo@`E|uABl_@vCbHDnW}B|CAtX~FpOdCrEhAbC~AtCh@q@xHlGDLhDd@b@hGv@p\\~ArJnFtj@nAzx@bD~Od@vAShAZjl@oBf_@iDhJcBhN_E~EgCdc@_L~UcI~ElEnCfRd@~@nNt@xKpEhBpA~UqGnUyJbK{@dBNhA`AV~Il@nAbAd@lr@bFvFKdm@eKxI_Dzc@wSdXxEpQsCte@`CdzAIpEl@zBlBdApDJrx@`@tEdBxDfO`Q`DpGnUp~@h@`Ge@jNd@jG`^vt@r@bFo@jHbf@pC|n@xJvMv@jBx@t@zBtCrQdIdl@pAdFlB`EpF`GpEhCxC`AlFh@hDGlDsDzAq@lBZl@dAFtFw@xQgA|JGrGj@jGhBxJErNpAdAn@`BtF@pMbBxg@lOdGtA|Hx@rfAvF~n@j@jMS~CmAbCsBe@~E?rHdCnIlGdItC|GlJtEbBjBH~BcDlO^n@~Ai@d@LOpFbDSrL~E|NfBfDz@lOvEtMxGlRpAza@bIpTfFfMn@xNjClOvLrK`FnElRtCj[|BzI|SzQnQ~KfEvHzGhU|AdLm@b^b@\\bJ`@pGz@VfBz@nACtFnDjCzE`WXfJ[~SVtGbDbMp@|EeAzJaC~I?fOmFbXqDbMyBzEqHdIeJt@qGhIgCv@CnHt@lBeCbP~GbBi@x@k@@',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000701',
    to_key: '0199c000-0000-7000-8000-000000000702',
    shape: 'fl{t@gpl}TA`@JB',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000702',
    to_key: 'stay',
    shape:
      '~m{t@_yl}TcEGo@o@rCmSu@mBBoHfCw@pGiIdJu@pHeIxB{EpDcMlFcX?gO`C_JdA{Jq@}EcDcMWuGZ_TYgJ{EaWoDkCBuF{@oAWgBqG{@cJa@c@]l@c^}AeL{GiUgEwHoQ_L}S{Q}B{IuCk[oEmRsKaFmOwLyNkCgMo@qTgF{a@cImRqAuMyGmOwEgD{@}NgBsL_F{CV?}F_B\\gA|Ak@_@nEmQ?gDcBkBmJuEuC}GmGeIeCoIJaKa@c@{EdB_CVuw@i@whA}FyO{Bei@_PiG}@sFUsHTmGdAaLrHiEnA}o@jJuFPoC[qp@iQ{GeDIg@bAqE_@cWlAyPMaG}d@ogBNmFtGuf@?uFaAcD_]yr@c@iD`@wOg@{HwUu~@yCkGeOyPiBaEe@uEG}w@}@yDoC}BmHa@guAL_g@_CkQpCcXqEsm@bXin@jK}I@ssAmJgHp@kUxGsBaCuJgEaO_AmD_T_FmE_VbIec@~K_FfCiN~DiJbBg_@hDkl@nB}nAqEuj@oAsJoFq\\_BiGw@e@c@MiDmGEp@yHuCi@cC_BsEiA_j@gKu[`CcHEm_@wC}uACko@aEc@e@McBu@i@gZPa_@vAyAJwAdA}FWyAz@cCOyFyAkDS\\dBW~GRtEeBhB[hBgMwDsRsCsOqAwOoEiG`SjQr@~MlCpWHv@LGd@',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000801',
    to_key: '0199c000-0000-7000-8000-000000000802',
    shape:
      '`b~r@min~TFe@w@MuCHmF]mKH_NmCkEE_Km@lBsGzKm\\~Ab@z^|EnCJfHv@|FRhCd@nDHpBXvDfAbCNxA{@|FVd@Qp@s@xAKp^wArNU|FJ~AIt@DZRN\\FvAb@d@`UbBhY|AjXEfVPhe@GvQdAtLpAbHDvEYvPcB|CAtX~FpOdCrEhAbC~AtCh@q@xHlGDLh@?~Bd@b@vA^pDVp\\~ArJnF~Ib@t_@j@zx@bD~Od@vAShAZ`HKvNu@pSm@`VkBdH}@hJcBhN_E~EgCdc@_L`EeB|O}El@RpDxDdAvHz@tDLxBd@~@nNt@xKpEhBpAt@IhTgGnUyJlB_@tG[dBN^Nh@p@Nz@FbHl@nAbAd@lr@bFvFKdm@eKxI_Djb@gSn@OtQpDnEf@`BKhKwBdBOzCF~YnBxEHxxAKlBDhBVnAj@pArAp@~ARpAJrx@`@tEdBxDfO`QjAhBtAfDnUp~@h@`G?hCe@`JBjB`@~CxBtFfZ`m@`@hBPxBo@jH~Ed@|VdAdGd@rCt@hj@bIvMv@nA`@|@rA^lBhCdPdIdl@pAdFlB`EhB`CfC~BpEhCxC`AlFh@|ABjAKt@a@vBqCzAq@h@?bAZl@dAHl@AfEw@xQgA|JGrGj@jGhBxJErNFTx@\\^l@Nr@AbBaApBO|By@dEIhQuCfFE|RpBCAcB~@C|@lm@bDG',
  },
  {
    from_key: '0199c000-0000-7000-8000-000000000802',
    to_key: 'stay',
    shape:
      'hekt@sl|}TcDFqAiy@x@mA?Wy@BCh@gDDFyBnCyEDwPdAgGMy@_AaA]gBJmBz@eACqFLoFc@kDoAsFg@qGHwGbA{J?{CZcIM_Ao@m@_@GeIk@yFq@wGiBeGsDaE}EoA}B{AuEuJkq@mAgGw@sC}@uAgAgA{FgBmFgAqr@aKmBU}XoAwEc@n@yDJyBK{B]wA_\\op@cAuCc@iDAkBb@kLEkCa@oDwUu~@i@_BoBkDeOyPiBaEe@uEG}w@KoAq@iBiAqAcBw@gBQoHC_qALsFMk_@qBcCXkIbB{BRiBMyTcEuAXi]nPsLxEin@jKiENsCMes@oFm_@}BcCFcDh@kUxGsBaCuJgEgMi@y@U]w@MyB{@uDeAwHqDyDm@S}O|EaEdBec@~K_FfCiN~DiJbBeH|@aVjBqSl@wNt@aHJ}j@eB_c@kBu_@k@_Jc@sJoFq\\_BqDWwA_@e@c@?_CMi@mGEp@yHuCi@cC_BsEiAqOeCgQ}DeGcA}CD_P`BwEXcHEuLqAwQeAie@FgVQkXDiY}AaUcBc@e@McBu@i@eCF}FKcNTa_@vAyAJq@r@e@P}FWyAz@cCOyFyAkDSGV\\ZFp@W~GRtEeBhB[hB{Aw@kJ_CsRsCyCEyJkAwOoEiG`S~Jl@jED~MlClKIlF\\tCIv@LGd@',
  },
]);
