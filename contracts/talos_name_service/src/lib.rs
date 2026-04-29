use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError,
    StdResult,
};
use cw_storage_plus::Map;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// ─── Errors ────────────────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),
    #[error("Name already taken")]
    NameTaken,
    #[error("Invalid name: must be 3-32 chars, lowercase alphanumeric + hyphens, no consecutive hyphens")]
    InvalidName,
}

// ─── Storage ───────────────────────────────────────────────────────────────

// name → talos_id
const NAME_RECORD: Map<&str, u64> = Map::new("name_record");
// talos_id → name
const TALOS_NAME: Map<u64, String> = Map::new("talos_name");

// ─── Messages ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    RegisterName { talos_id: u64, name: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    ResolveName { name: String },
    NameOf { talos_id: u64 },
    IsNameAvailable { name: String },
    HasName { talos_id: u64 },
}

// ─── Entry points ──────────────────────────────────────────────────────────

#[entry_point]
pub fn instantiate(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::RegisterName { talos_id, name } => {
            execute_register_name(deps, talos_id, name)
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::ResolveName { name } => {
            to_json_binary(&NAME_RECORD.may_load(deps.storage, &name)?)
        }
        QueryMsg::NameOf { talos_id } => {
            to_json_binary(&TALOS_NAME.may_load(deps.storage, talos_id)?)
        }
        QueryMsg::IsNameAvailable { name } => {
            to_json_binary(&query_is_name_available(deps, &name))
        }
        QueryMsg::HasName { talos_id } => {
            to_json_binary(&TALOS_NAME.may_load(deps.storage, talos_id)?.is_some())
        }
    }
}

// ─── Execute handlers ──────────────────────────────────────────────────────

fn execute_register_name(
    deps: DepsMut,
    talos_id: u64,
    name: String,
) -> Result<Response, ContractError> {
    if !validate_name(&name) {
        return Err(ContractError::InvalidName);
    }
    if NAME_RECORD.may_load(deps.storage, &name)?.is_some() {
        return Err(ContractError::NameTaken);
    }
    NAME_RECORD.save(deps.storage, &name, &talos_id)?;
    TALOS_NAME.save(deps.storage, talos_id, &name)?;
    Ok(Response::new()
        .add_attribute("action", "register_name")
        .add_attribute("talos_id", talos_id.to_string())
        .add_attribute("name", name))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn validate_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    let len = bytes.len();
    if len < 3 || len > 32 {
        return false;
    }
    // Must start and end with alphanumeric; only lowercase a-z, 0-9, hyphen allowed; no "--"
    if !bytes[0].is_ascii_alphanumeric() || !bytes[len - 1].is_ascii_alphanumeric() {
        return false;
    }
    if name.contains("--") {
        return false;
    }
    bytes.iter().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

fn query_is_name_available(deps: Deps, name: &str) -> bool {
    if !validate_name(name) {
        return false;
    }
    NAME_RECORD.may_load(deps.storage, name).unwrap_or(None).is_none()
}
