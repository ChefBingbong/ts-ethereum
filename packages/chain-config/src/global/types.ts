import { EIP, type Hardfork } from '../fork-params/enums'
import type {
  BerlinAndLater,
  ByzantiumAndLater,
  CancunAndLater,
  ChainstartAndLater,
  ConstantinopleAndLater,
  EIP1Params,
  EIP606Params,
  EIP607Params,
  EIP608Params,
  EIP609Params,
  EIP663Params,
  EIP1013Params,
  EIP1153Params,
  EIP1559Params,
  EIP1679Params,
  EIP2384Params,
  EIP2537Params,
  EIP2565Params,
  EIP2929Params,
  EIP2930Params,
  EIP2935Params,
  EIP3198Params,
  EIP3529Params,
  EIP3554Params,
  EIP3855Params,
  EIP3860Params,
  EIP4200Params,
  EIP4345Params,
  EIP4399Params,
  EIP4750Params,
  EIP4788Params,
  EIP4844Params,
  EIP5133Params,
  EIP5656Params,
  EIP6206Params,
  EIP7002Params,
  EIP7069Params,
  EIP7251Params,
  EIP7480Params,
  EIP7516Params,
  EIP7594Params,
  EIP7620Params,
  EIP7623Params,
  EIP7691Params,
  EIP7702Params,
  EIP7825Params,
  EIP7934Params,
  EIP7939Params,
  HomesteadAndLater,
  IstanbulAndLater,
  LondonAndLater,
  OsakaAndLater,
  ParisAndLater,
  PragueAndLater,
  ShanghaiAndLater,
  SpuriousDragonAndLater,
  TangerineWhistleAndLater,
} from '../types'

export interface MinHardforkFor {
  // Chainstart (always available)

  [EIP.EIP_1]: ChainstartAndLater
  [EIP.EIP_7934]: ChainstartAndLater

  // Homestead
  [EIP.EIP_606]: HomesteadAndLater

  // Tangerine Whistle
  [EIP.EIP_608]: TangerineWhistleAndLater

  // Spurious Dragon
  [EIP.EIP_607]: SpuriousDragonAndLater

  // Byzantium
  [EIP.EIP_609]: ByzantiumAndLater

  // Constantinople
  [EIP.EIP_1013]: ConstantinopleAndLater

  // Istanbul
  [EIP.EIP_1679]: IstanbulAndLater
  [EIP.EIP_2384]: IstanbulAndLater // Muir Glacier (same era)

  // Berlin
  [EIP.EIP_2565]: BerlinAndLater
  [EIP.EIP_2929]: BerlinAndLater
  [EIP.EIP_2930]: BerlinAndLater

  // London
  [EIP.EIP_1559]: LondonAndLater
  [EIP.EIP_3198]: LondonAndLater
  [EIP.EIP_3529]: LondonAndLater
  [EIP.EIP_3554]: LondonAndLater // Arrow Glacier
  [EIP.EIP_4345]: LondonAndLater // Gray Glacier
  [EIP.EIP_5133]: LondonAndLater // Gray Glacier

  // Paris (The Merge)
  [EIP.EIP_4399]: ParisAndLater
  [EIP.EIP_7002]: ParisAndLater
  [EIP.EIP_7251]: ParisAndLater

  // Shanghai
  [EIP.EIP_3651]: ShanghaiAndLater
  [EIP.EIP_3855]: ShanghaiAndLater
  [EIP.EIP_3860]: ShanghaiAndLater

  // Cancun
  [EIP.EIP_1153]: CancunAndLater
  [EIP.EIP_4788]: CancunAndLater
  [EIP.EIP_4844]: CancunAndLater
  [EIP.EIP_5656]: CancunAndLater
  [EIP.EIP_7516]: CancunAndLater

  // Prague
  [EIP.EIP_2537]: PragueAndLater
  [EIP.EIP_2935]: PragueAndLater
  [EIP.EIP_7623]: PragueAndLater
  [EIP.EIP_7691]: PragueAndLater
  [EIP.EIP_7702]: PragueAndLater

  // Osaka
  [EIP.EIP_663]: OsakaAndLater
  [EIP.EIP_4200]: OsakaAndLater
  [EIP.EIP_4750]: OsakaAndLater
  [EIP.EIP_6206]: OsakaAndLater
  [EIP.EIP_7069]: OsakaAndLater
  [EIP.EIP_7480]: OsakaAndLater
  [EIP.EIP_7594]: OsakaAndLater
  [EIP.EIP_7620]: OsakaAndLater
  [EIP.EIP_7825]: OsakaAndLater
  [EIP.EIP_7939]: OsakaAndLater
}

export type EIPWithHardfork = keyof MinHardforkFor

export interface EIPParamsMap {
  [EIP.EIP_1]: EIP1Params
  [EIP.EIP_606]: EIP606Params
  [EIP.EIP_607]: EIP607Params
  [EIP.EIP_608]: EIP608Params
  [EIP.EIP_609]: EIP609Params
  [EIP.EIP_663]: EIP663Params
  [EIP.EIP_1013]: EIP1013Params
  [EIP.EIP_1153]: EIP1153Params
  [EIP.EIP_1559]: EIP1559Params
  [EIP.EIP_1679]: EIP1679Params
  [EIP.EIP_2384]: EIP2384Params
  [EIP.EIP_2537]: EIP2537Params
  [EIP.EIP_2565]: EIP2565Params
  [EIP.EIP_2929]: EIP2929Params
  [EIP.EIP_2930]: EIP2930Params
  [EIP.EIP_2935]: EIP2935Params
  [EIP.EIP_3198]: EIP3198Params
  [EIP.EIP_3529]: EIP3529Params
  [EIP.EIP_3554]: EIP3554Params
  [EIP.EIP_3855]: EIP3855Params
  [EIP.EIP_3860]: EIP3860Params
  [EIP.EIP_4200]: EIP4200Params
  [EIP.EIP_4345]: EIP4345Params
  [EIP.EIP_4399]: EIP4399Params
  [EIP.EIP_4750]: EIP4750Params
  [EIP.EIP_4788]: EIP4788Params
  [EIP.EIP_4844]: EIP4844Params
  [EIP.EIP_5133]: EIP5133Params
  [EIP.EIP_5656]: EIP5656Params
  [EIP.EIP_6206]: EIP6206Params
  [EIP.EIP_7069]: EIP7069Params
  [EIP.EIP_7480]: EIP7480Params
  [EIP.EIP_7516]: EIP7516Params
  [EIP.EIP_7594]: EIP7594Params
  [EIP.EIP_7620]: EIP7620Params
  [EIP.EIP_7623]: EIP7623Params
  [EIP.EIP_7691]: EIP7691Params
  [EIP.EIP_7702]: EIP7702Params
  [EIP.EIP_7825]: EIP7825Params
  [EIP.EIP_7939]: EIP7939Params
  [EIP.EIP_7934]: EIP7934Params
  [EIP.EIP_7002]: EIP7002Params
  [EIP.EIP_7251]: EIP7251Params
}

export type EIPWithParams = keyof EIPParamsMap

export type EIPParamKeys<E extends EIPWithParams> = keyof EIPParamsMap[E] &
  string

export type EIPParamType<
  E extends EIPWithParams,
  K extends EIPParamKeys<E>,
> = EIPParamsMap[E][K]

export type IsEIPActiveAt<
  E extends EIPWithHardfork,
  H extends Hardfork,
> = H extends MinHardforkFor[E] ? true : false
