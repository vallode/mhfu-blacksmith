const rarityColors = {
  1: '#ffffff',
  2: '#ffffff',
  3: '#ffffff',
  4: '#52F152',
  5: '#FD9DC8',
  6: '#54F1F1',
  7: '',
  8: '',
  9: '',
  10: '',
}

function loadWeaponData(data) {
  console.groupCollapsed("Loading weapon data for: ", data.name)
  console.table(data)
  
  const weaponDetails = document.querySelector('#weaponDetails')
  const weaponCrafting = document.querySelector('#weaponCrafting')
  const clone = document.querySelector('#weaponDetailsTemplate').content.cloneNode(true)
  clone.querySelector('.row').classList.add(`rarity-${data.rarity}`)
  clone.querySelector("#weaponName").textContent = data.name
  clone.querySelector("#weaponCraftingCost").textContent = `${data["upgrade-cost"]} / ${data["create-cost"]}`
  clone.querySelector("#weaponAttack").textContent = data.attack
  clone.querySelector("#weaponAffinity").textContent = data.affinity
  clone.querySelector("#weaponSlots").textContent = data.slots

  if (data["upgrade-mats"] !== "N/A") {
    data["upgrade-mats"].forEach(material => {
      const p = document.createElement("p")
      p.textContent = material
      clone.querySelector('#requirements').appendChild(p)
    })
  } else {
    data["create-mats"].forEach(material => {
      const p = document.createElement("p")
      p.textContent = material
      clone.querySelector('#requirements').appendChild(p)
    })
  }

  weaponDetails.innerHTML = ""
  weaponDetails.appendChild(clone)

  const imgContainer = document.createElement("div")
  imgContainer.classList.add("weaponImageContainer")
  const img = document.createElement("img")
  imgContainer.appendChild(img)
  img.src = "/assets/images/weapons/white-serpentblade.png"
  weaponCrafting.innerHTML = ""
  weaponCrafting.append(imgContainer)
  console.groupEnd()
}

const elementRegex = /([A-Z])\w+/g
const table = document.querySelector('.table')
const table__entry = document.querySelector('#table__entry')

weaponMap.forEach(element => {
  element.forEach((value, index) => {
    if (value === "" || value === "+") return
    const data = weaponData.find(element => element.name === value)

    const clone = table__entry.content.cloneNode(true)
    clone.querySelector('.row').style.paddingLeft = `${26 * index}px` 
    clone.querySelector('.name').textContent = value

    if (data) {
      const weaponId = data.name.toLowerCase().replace(" ", "-")
      clone.querySelector('.row').id = weaponId
      clone.querySelector('.row').addEventListener("click", event => {
        loadWeaponData(data)
        var newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + `?weapon=${weaponId}`;
        window.history.replaceState({path:newurl}, '', newurl);
      })
      clone.querySelector('.icon').classList.add(`icon--rarity-${data.rarity}`)
    }

    if (data && data.element.match(elementRegex)) {
      data.element.match(elementRegex).forEach(match => {
        clone.querySelector('.icon').classList.add(`icon--${match.toLowerCase()}`)
      })
    }

    if (value.includes("(hh)")) {
      clone.querySelector('.icon img').src = "/assets/images/hh.png"
      clone.querySelector('.row').classList.add("row--external")
      clone.querySelector('.row').href = "/blacksmith/hunting-horn/"
    } else if (value.includes("(hm)")) {
      clone.querySelector('.icon img').src = "/assets/images/hm.png"
      clone.querySelector('.row').classList.add("row--external")
      clone.querySelector('.row').href = "/blacksmith/hammer/"
    } else {
      clone.querySelector('.icon').classList.add(`icon--${document.body.dataset.weaponName}`)
    }

    table.appendChild(clone)
  })
})
