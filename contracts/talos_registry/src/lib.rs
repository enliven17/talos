use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError,
    StdResult, Uint128,
};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// ─── Errors ────────────────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("TALOS not found")]
    TalosNotFound,
}

// ─── State types ───────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Patron {
    pub creator_share: u32,
    pub investor_share: u32,
    pub treasury_share: u32,
    pub creator_addr: String,
    pub investor_addr: String,
    pub treasury_addr: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Kernel {
    pub approval_threshold: Uint128,
    pub gtm_budget: Uint128,
    pub min_patron_pulse: Uint128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Pulse {
    pub total_supply: Uint128,
    pub price_uinit: Uint128,
    pub token_symbol: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Talos {
    pub id: u64,
    pub name: String,
    pub category: String,
    pub description: String,
    pub creator: String,
    pub patron: Patron,
    pub kernel: Kernel,
    pub pulse: Pulse,
    pub created_at: u64,
    pub active: bool,
}

// ─── Storage ───────────────────────────────────────────────────────────────

const NEXT_ID: Item<u64> = Item::new("next_id");
const REGISTRY: Map<u64, Talos> = Map::new("registry");
const PROTOCOL_WALLET: Item<String> = Item::new("protocol_wallet");
const PROTOCOL_FEE_BPS: Item<u64> = Item::new("protocol_fee_bps");
const ADMIN: Item<String> = Item::new("admin");

// ─── Messages ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    pub protocol_wallet: String,
    /// Protocol fee in basis points (e.g. 300 = 3%)
    pub protocol_fee_bps: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    CreateTalos {
        name: String,
        category: String,
        description: String,
        patron: Patron,
        kernel: Kernel,
        pulse: Pulse,
    },
    UpdatePatron {
        talos_id: u64,
        patron: Patron,
    },
    UpdateKernel {
        talos_id: u64,
        kernel: Kernel,
    },
    UpdatePulse {
        talos_id: u64,
        pulse: Pulse,
    },
    DeactivateTalos {
        talos_id: u64,
    },
    SetProtocolWallet {
        wallet: String,
    },
    SetProtocolFeeBps {
        fee_bps: u64,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetTalos { talos_id: u64 },
    CreatorOf { talos_id: u64 },
    IsActive { talos_id: u64 },
    NextTalosId {},
    ProtocolWallet {},
    ProtocolFeeBps {},
}

// ─── Entry points ──────────────────────────────────────────────────────────

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    ADMIN.save(deps.storage, &info.sender.to_string())?;
    NEXT_ID.save(deps.storage, &1u64)?;
    PROTOCOL_WALLET.save(deps.storage, &msg.protocol_wallet)?;
    PROTOCOL_FEE_BPS.save(deps.storage, &msg.protocol_fee_bps)?;
    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("admin", info.sender))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateTalos { name, category, description, patron, kernel, pulse } => {
            execute_create_talos(deps, env, info, name, category, description, patron, kernel, pulse)
        }
        ExecuteMsg::UpdatePatron { talos_id, patron } => {
            execute_update_patron(deps, info, talos_id, patron)
        }
        ExecuteMsg::UpdateKernel { talos_id, kernel } => {
            execute_update_kernel(deps, info, talos_id, kernel)
        }
        ExecuteMsg::UpdatePulse { talos_id, pulse } => {
            execute_update_pulse(deps, info, talos_id, pulse)
        }
        ExecuteMsg::DeactivateTalos { talos_id } => {
            execute_deactivate_talos(deps, info, talos_id)
        }
        ExecuteMsg::SetProtocolWallet { wallet } => {
            execute_set_protocol_wallet(deps, info, wallet)
        }
        ExecuteMsg::SetProtocolFeeBps { fee_bps } => {
            execute_set_protocol_fee_bps(deps, info, fee_bps)
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetTalos { talos_id } => to_json_binary(&query_get_talos(deps, talos_id)?),
        QueryMsg::CreatorOf { talos_id } => to_json_binary(&query_creator_of(deps, talos_id)?),
        QueryMsg::IsActive { talos_id } => to_json_binary(&query_is_active(deps, talos_id)?),
        QueryMsg::NextTalosId {} => to_json_binary(&NEXT_ID.load(deps.storage)?),
        QueryMsg::ProtocolWallet {} => to_json_binary(&PROTOCOL_WALLET.load(deps.storage)?),
        QueryMsg::ProtocolFeeBps {} => to_json_binary(&PROTOCOL_FEE_BPS.load(deps.storage)?),
    }
}

// ─── Execute handlers ──────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn execute_create_talos(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    name: String,
    category: String,
    description: String,
    patron: Patron,
    kernel: Kernel,
    pulse: Pulse,
) -> Result<Response, ContractError> {
    let id = NEXT_ID.load(deps.storage)?;
    let creator = patron.creator_addr.clone();
    let talos = Talos {
        id,
        name,
        category,
        description,
        creator: creator.clone(),
        patron,
        kernel,
        pulse,
        created_at: env.block.time.seconds(),
        active: true,
    };
    REGISTRY.save(deps.storage, id, &talos)?;
    NEXT_ID.save(deps.storage, &(id + 1))?;
    Ok(Response::new()
        .add_attribute("action", "create_talos")
        .add_attribute("talos_id", id.to_string())
        .add_attribute("creator", creator))
}

fn execute_update_patron(
    deps: DepsMut,
    info: MessageInfo,
    talos_id: u64,
    patron: Patron,
) -> Result<Response, ContractError> {
    let mut talos = load_talos(deps.as_ref(), talos_id)?;
    if info.sender.as_str() != talos.creator {
        let admin = ADMIN.load(deps.storage)?;
        if info.sender.as_str() != admin {
            return Err(ContractError::Unauthorized);
        }
    }
    talos.patron = patron;
    REGISTRY.save(deps.storage, talos_id, &talos)?;
    Ok(Response::new()
        .add_attribute("action", "update_patron")
        .add_attribute("talos_id", talos_id.to_string()))
}

fn execute_update_kernel(
    deps: DepsMut,
    info: MessageInfo,
    talos_id: u64,
    kernel: Kernel,
) -> Result<Response, ContractError> {
    let mut talos = load_talos(deps.as_ref(), talos_id)?;
    if info.sender.as_str() != talos.creator {
        let admin = ADMIN.load(deps.storage)?;
        if info.sender.as_str() != admin {
            return Err(ContractError::Unauthorized);
        }
    }
    talos.kernel = kernel;
    REGISTRY.save(deps.storage, talos_id, &talos)?;
    Ok(Response::new()
        .add_attribute("action", "update_kernel")
        .add_attribute("talos_id", talos_id.to_string()))
}

fn execute_update_pulse(
    deps: DepsMut,
    info: MessageInfo,
    talos_id: u64,
    pulse: Pulse,
) -> Result<Response, ContractError> {
    let mut talos = load_talos(deps.as_ref(), talos_id)?;
    if info.sender.as_str() != talos.creator {
        let admin = ADMIN.load(deps.storage)?;
        if info.sender.as_str() != admin {
            return Err(ContractError::Unauthorized);
        }
    }
    talos.pulse = pulse;
    REGISTRY.save(deps.storage, talos_id, &talos)?;
    Ok(Response::new()
        .add_attribute("action", "update_pulse")
        .add_attribute("talos_id", talos_id.to_string()))
}

fn execute_deactivate_talos(
    deps: DepsMut,
    info: MessageInfo,
    talos_id: u64,
) -> Result<Response, ContractError> {
    let mut talos = load_talos(deps.as_ref(), talos_id)?;
    let admin = ADMIN.load(deps.storage)?;
    if info.sender.as_str() != talos.creator && info.sender.as_str() != admin {
        return Err(ContractError::Unauthorized);
    }
    talos.active = false;
    REGISTRY.save(deps.storage, talos_id, &talos)?;
    Ok(Response::new()
        .add_attribute("action", "deactivate_talos")
        .add_attribute("talos_id", talos_id.to_string()))
}

fn execute_set_protocol_wallet(
    deps: DepsMut,
    info: MessageInfo,
    wallet: String,
) -> Result<Response, ContractError> {
    only_admin(deps.as_ref(), &info)?;
    PROTOCOL_WALLET.save(deps.storage, &wallet)?;
    Ok(Response::new().add_attribute("action", "set_protocol_wallet"))
}

fn execute_set_protocol_fee_bps(
    deps: DepsMut,
    info: MessageInfo,
    fee_bps: u64,
) -> Result<Response, ContractError> {
    only_admin(deps.as_ref(), &info)?;
    PROTOCOL_FEE_BPS.save(deps.storage, &fee_bps)?;
    Ok(Response::new().add_attribute("action", "set_protocol_fee_bps"))
}

// ─── Query handlers ────────────────────────────────────────────────────────

fn query_get_talos(deps: Deps, talos_id: u64) -> StdResult<Talos> {
    REGISTRY.load(deps.storage, talos_id)
}

fn query_creator_of(deps: Deps, talos_id: u64) -> StdResult<String> {
    Ok(REGISTRY.load(deps.storage, talos_id)?.creator)
}

fn query_is_active(deps: Deps, talos_id: u64) -> StdResult<bool> {
    Ok(REGISTRY.load(deps.storage, talos_id)?.active)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn load_talos(deps: Deps, talos_id: u64) -> Result<Talos, ContractError> {
    REGISTRY.load(deps.storage, talos_id).map_err(|_| ContractError::TalosNotFound)
}

fn only_admin(deps: Deps, info: &MessageInfo) -> Result<(), ContractError> {
    let admin = ADMIN.load(deps.storage)?;
    if info.sender.as_str() != admin {
        return Err(ContractError::Unauthorized);
    }
    Ok(())
}
