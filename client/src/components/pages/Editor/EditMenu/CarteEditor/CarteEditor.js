import { Component, PureComponent } from "react"

import styled from "styled-components"

import { DragDropContext, Droppable } from "react-beautiful-dnd"

import { Typography, Grid, TextField, Button, Divider } from "@material-ui/core"
import DeleteForeverIcon from "@material-ui/icons/DeleteForever"
import EditIcon from "@material-ui/icons/Edit"

import ThemeContext from "../../../../../ThemeContext"
import Menu from "../../../Menu/Menu"
import Category from "./Category"
import ProductTooltip, { Tooltip } from "./ProductTooltip"
import ProductForm from "../shared/ProductForm"
import CategoryForm from "../shared/CategoryForm"
import SubNavigation from "../shared/SubNavigation"
import Spinner from "../../../../shared/Spinner"
import SnackbarAlert from "../../../../shared/SnackbarAlert"

import MenuService from "../../../../../service/menu.service"

import { capitalizeTheFirstLetterOfEachWord, findCategoryIndex, saveChanges } from "../../../../../utils"

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: ${props => props.width};
  margin: ${props => props.margin || "30px auto 0"};
  @media (max-width: 1067px) {
    width: 100%;
    align-items: center;
  }
`
export const MenuForm = styled.form`
  width: 500px;
  margin: -17px 80px 0 0;
  @media (max-width: 1067px) {
    width: 100%;
    margin: -17px 0 0;
  }
`
export const MenuFormFieldContainer = styled(Grid)`
  padding-left: 50px;
  @media (max-width: 1067px) {
    padding: 0 15px;
  }
  & input, label {
    font-family: arial;
  }
`
export const Title = styled(Typography)`
  padding: 0 65px;
  font-weight: 400;
  @media (max-width: 1067px) {
    padding-left: 18px;
  }
`
export const MenuTitleContainer = styled(Grid)`
  margin: ${props => props.margintop || "0"} auto 0;
  width: 1008px;
  font-style: ${props => props.fontStyle};
  @media (max-width: 1067px) {
    width: 100%;
    max-width: 548px;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: nowrap;
  }
`

class InnerList extends PureComponent {
  render() {
    const {
      category,
      products,
      index,
      showConfirmationMessage,
      editCategory,
      openProductForm,
      showProductTooltip,
      hideProductTooltip,
    } = this.props

    return <Category
      category={category}
      products={products}
      index={index}
      showConfirmationMessage={showConfirmationMessage}
      editCategory={editCategory}
      openProductForm={openProductForm}
      showProductTooltip={showProductTooltip}
      hideProductTooltip={hideProductTooltip}
    />
  }
}

class CarteEditor extends Component {
  static contextType = ThemeContext

  constructor(props) {
    super()

    this.state = {
      menu: props.menu,
      showMenuInput: false,
      categories: undefined,
      products: undefined,
      openModal: false, // edit product form
      modalProduct: null,
      productFormKey: 0, // key for the ProductForm component when it's a new product and does not have _id yet
      showProductTooltip: false, // overview of the product
      tooltipProduct: undefined,
      previewMenu: false,
      alert: {
        open: false,
        message: "",
        severity: undefined,
        vertical: "bottom",
      },
    }
    this.menuService = new MenuService()
  }

  componentDidMount = async () => {
    try {
      const categories = (await this.menuService.getCategories()).data.message
      const products = (await this.menuService.getProducts()).data.message
      const menuCategories = categories.filter(cat => cat.inMenu === this.props.menu._id)
      const otherCategories = categories.filter(cat => cat.inMenu !== this.props.menu._id)

      this.setState({ categories: menuCategories, products, otherCategories })
    }
    catch (error) {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: "Error de servidor",
          vertical: "bottom",
        }
      })
    }
  }

  showAlert = (message, severity, vertical) => {
    this.setState({
      alert: {
        open: true,
        message,
        severity,
        vertical,
      }
    })
  }

  closeAlert = (message, severity) => {
    this.setState({
      alert: {
        ...this.state.alert,
        open: false,
        message,
        severity,
      }
    })
  }

  onDragEnd = async (result) => {
    const { destination, source, draggableId, type } = result
    const index = (elm, category) => elm.categories.find(cat => cat.id === category).index

    // 1 - if dropped outside the droppable elements
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return

    // 2 - if dragging a category
    if (type === 'category') {
      const newCategories = [...this.state.categories],
        src = source.index + 1, dest = destination.index + 1

      newCategories.forEach((cat, i, arr) => {
        (dest > src)
          ? (dest >= cat.index && cat.index > src) && arr[i].index--
          : (dest <= cat.index && cat.index < src) && arr[i].index++

        if (cat._id === draggableId) { arr[i].index = dest }
      })

      this.setState({ categories: newCategories }, () => this.updateDBWithChanges(newCategories))
    }

    // 3 - if dragging a product inside the same category
    else if (source.droppableId === destination.droppableId) {
      const category = source.droppableId
      // filter products in category
      const newProducts = this.state.products.filter(prod => {
        return prod.categories.some(cat => {
          return cat.id === category
        })
      })
      // change index of category in each product
      newProducts.forEach((prod, i, arr) => {
        (destination.index > source.index)
          ? (destination.index >= index(prod, category) && index(prod, category) > source.index)
          && arr[i].categories.find(cat => cat.id === category).index--
          : (destination.index <= index(prod, category) && index(prod, category) < source.index)
          && arr[i].categories.find(cat => cat.id === category).index++

        if (prod._id === draggableId) { // dragged product
          arr[i].categories.find(cat => cat.id === category).index = destination.index
        }
      })
      // save changes
      const products = [...newProducts,
      ...this.state.products.filter(prod => {
        return prod.categories.every(cat => {
          return cat.id !== category
        })
      })
      ]
      this.setState({ products }, () => this.updateDBWithChanges(null, newProducts))
    }

    // 4 - if dragging a product to a different category
    else {
      // filter source category products
      const newSourceProducts = this.state.products.filter(prod => {
        return prod.categories.some(cat => {
          return cat.id === source.droppableId
        })
      })
      // filter destination category products
      const newDestinationProducts = this.state.products.filter(prod => {
        return prod.categories.some(cat => {
          return cat.id === destination.droppableId
        })
      })
      // change index of source category products affected
      newSourceProducts.forEach((prod, i, arr) => {
        (index(prod, source.droppableId) > source.index) && arr[i].categories.find(cat => cat.id === source.droppableId).index--
        if (prod._id === draggableId) { // change category affected in dragged product
          arr[i].categories.find(cat => cat.id === source.droppableId).id = destination.droppableId
          destination.index
            ? arr[i].categories.find(cat => cat.id === destination.droppableId).index = destination.index
            : arr[i].categories.find(cat => cat.id === destination.droppableId).index = 1
        }
      })
      // change index of destination category products affected
      newDestinationProducts.forEach((prod, i, arr) => {
        (destination.index <= index(prod, destination.droppableId))
          && arr[i].categories.find(cat => cat.id === destination.droppableId).index++
      })
      // save changes
      const newProducts = [...newDestinationProducts, ...newSourceProducts]
      const products = [...newProducts,
      ...this.state.products.filter(prod => {
        return prod.categories.every(cat => {
          return (cat.id !== source.droppableId && cat.id !== destination.droppableId)
        })
      }),
      ]
      this.setState({ products }, () => this.updateDBWithChanges(null, newProducts))
    }
  }

  updateDBWithChanges = async (categories, products) => {
    const alert = await saveChanges(categories, products)
    alert ? this.setState({ alert }) : this.closeProductForm()
  }

  showConfirmationMessage = (i, id, category) => {
    id // id passed => category or product
      ? this.setState({
        alert: {
          open: true,
          message: `¿Seguro que quieres borrar ${category // category passed => product
            ? "el producto?" // no category passed => category
            : "la categoría? También se borrarán los productos que contenga, si es que los hay."}`,
          severity: "warning",
          vertical: "top",
          i,
          id,
          category,
        }
      }) // no id passed => menu
      : this.setState({
        alert: {
          open: true,
          message: "¿Seguro que quieres borrar la carta? También se borrará todo su contenido.",
          severity: "warning",
          vertical: "top",
        }
      })
  }

  toggleMenuInput = () => {
    if (!this.state.showMenuInput) {
      window.addEventListener('mousedown', this.handleClick)
      window.addEventListener('keypress', this.handleEnter)
      this.setState({ showMenuInput: true })
    }
  }

  handleClick = (e) => {
    if (e.target.name !== "name" && e.target.name !== "description") {
      this.MenuInputSubmit()
    }
  }

  handleEnter = (e) => {
    e.key === "Enter" && this.MenuInputSubmit()
  }

  handleMenuInputChange = (e) => {
    const { value, name } = e.target
    this.setState({ menu: { ...this.state.menu, [name]: value } })
  }

  MenuInputSubmit = () => {
    if (this.props.otherMenus.some(elm => elm.name.toUpperCase() === this.state.menu.name.toUpperCase())) {
      window.removeEventListener('mousedown', this.handleClick)
      window.removeEventListener('keypress', this.handleEnter)
      this.setState({
        menu: {
          ...this.state.menu,
          name: this.props.menu.name
        },
        showMenuInput: false,
        alert: {
          open: true,
          severity: "error",
          message: `Ya existe una carta con el nombre ${this.state.menu.name.toUpperCase()}`,
          vertical: "bottom",
        }
      })
    }
    else if (this.state.menu.name === "") {
      window.removeEventListener('mousedown', this.handleClick)
      window.removeEventListener('keypress', this.handleEnter)
      this.setState({
        menu: {
          ...this.state.menu,
          name: this.props.menu.name
        },
        showMenuInput: false,
        alert: {
          open: true,
          severity: "error",
          message: "No puedes dejar el nombre de la carta en blanco",
          vertical: "bottom",
        }
      })
    }
    else {
      window.removeEventListener('mousedown', this.handleClick)
      window.removeEventListener('keypress', this.handleEnter)
      this.props.editMenu(this.state.menu)
      this.setState({ showMenuInput: false })
    }
  }

  deleteCategory = async (i, id) => {
    try {
      const categories = [...this.state.categories]
      const productsInDeletedCategory = this.state.products.filter(prod => {
        return prod.categories.some(cat => {
          return cat.id === categories[i]._id
        })
      })
      const ProductsToUpdate = productsInDeletedCategory.filter(prod => prod.categories.length !== 1)
      const ProductsToDelete = productsInDeletedCategory.filter(prod => prod.categories.length === 1)
      const otherProducts = this.state.products.filter(elm => elm.category !== categories[i]._id)

      ProductsToUpdate.forEach(prod => prod.categories.splice(prod.categories.findIndex(cat => cat.id === id), 1))
      categories.forEach((elm, idx, arr) => {
        if (elm.index > i) arr[idx].index--
      })
      categories.splice(i, 1)

      Promise.all(ProductsToUpdate.map(prod => this.menuService.updateProduct(prod._id, prod)))
      Promise.all(ProductsToDelete.map(prod => this.menuService.deleteProduct(prod._id)))
      const deletedCategory = await this.menuService.deleteCategory(id)

      this.setState({
        categories,
        products: otherProducts,
        alert: {
          open: true,
          severity: "success",
          message: `La categoría ${deletedCategory.data.name.toUpperCase()} ha sido eliminado de la base de datos`,
          vertical: "bottom",
        }
      })
    }
    catch (error) {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: "Error de servidor",
          vertical: "bottom",
        }
      })
    }
  }

  editCategory = (category) => {
    if (category.name === undefined) return
    const categories = [...this.state.categories].filter(cat => cat._id !== category._id)
    if (categories.some(cat => cat.name.toUpperCase() === category.name.toUpperCase())) {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: `La categoría ${category.name.toUpperCase()} ya existe`,
          vertical: "bottom",
        }
      })
    }
    else if (category.name === "") {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: "No puedes dejar el nombre de la categoría en blanco",
          vertical: "bottom",
        }
      })
    }
    else {
      categories.push(category)
      this.setState({ categories }, () => this.updateDBWithChanges([category]))
    }
  }

  addCategory = async (e, category) => {
    e.preventDefault()

    if (this.state.categories.some(cat => cat.name.toUpperCase() === category.toUpperCase())) {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: `La categoría ${category.toUpperCase()} ya existe`,
          vertical: "bottom",
        }
      })
    }
    else if (!category) {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: "Indica el nombre de la nueva categoría",
          vertical: "bottom",
        }
      })
    }
    else {
      try {
        const newCategory = await this.menuService.addCategory({ name: category, inMenu: this.props.menu._id })
        const categories = [...this.state.categories]
        categories.push(newCategory.data)
        this.setState({ categories })
      }
      catch (error) {
        this.setState({
          alert: {
            open: true,
            severity: "error",
            message: "Error de servidor",
            vertical: "bottom",
          }
        })
      }
    }
  }

  deleteProduct = async (idx, category, id) => {
    try {
      let message
      const product = this.state.products.find(elm => elm._id === id)
      if (product.categories.length === 1 && !product.isMenuProduct) {
        const deletedProduct = await this.menuService.deleteProduct(id)
        message = `El producto ${deletedProduct.data.name.toUpperCase()} ha sido eliminado de la base de datos`
      }
      else {
        product.categories.splice(product.categories.findIndex(elm => elm.id === category), 1)
        const deletedProduct = await this.menuService.updateProduct(id, product)
        message = `El producto ${deletedProduct.data.name.toUpperCase()} ha sido eliminado de esta carta`
      }
      const sameCategoryProducts = this.state.products.filter(prod => {
        return prod.categories.some(cat => {
          return cat.id === category
        }) && prod._id !== id
      })
      const otherProducts = this.state.products.filter(prod => {
        return prod.categories.every(cat => {
          return cat.id !== category
        })
      })

      sameCategoryProducts.forEach((elm, i, arr) => {
        if (elm.categories.find(cat => cat.id === category).index > idx) {
          arr[i].categories.find(cat => cat.id === category).index--
        }
      })

      this.setState({
        products: sameCategoryProducts.concat(otherProducts),
        alert: {
          open: true,
          severity: "success",
          message,
          vertical: "bottom",
        }
      })
    }
    catch (error) {
      this.setState({
        alert: {
          open: true,
          severity: "error",
          message: "Error de servidor",
          vertical: "bottom",
        }
      })
    }
  }

  openProductForm = async (product, category) => {
    if (category) { // if yes it's a new product, if not it's an existing product
      const index = await findCategoryIndex(category)
      this.setState({
        openModal: true,
        modalProduct: {
          categories: [{ id: category, index }],
          allergies: [],
          minPortions: 1,
          price: [{
            subDescription: "",
            subPrice: 0
          }],
        },
        productFormKey: this.state.productFormKey + 1
      })
    }
    else this.setState({ openModal: true, modalProduct: product })
  }

  submitProductForm = async (e, product) => {
    e.preventDefault()
    let products = [...this.state.products]

    // clean last price if no description or price was intorduced
    if (product.price.length > 1) {
      const lastPrice = product.price[product.price.length - 1]
      if (!lastPrice.subDescription || !lastPrice.subPrice) product.price.splice(-1, 1)
    }

    // if it's an existing product
    if (product._id) {
      products = products.filter(prod => prod._id !== product._id)
      if (products.some(prod => prod.name.toUpperCase() === product.name.toUpperCase())) {
        this.setState({
          alert: {
            open: true,
            severity: "error",
            message: `El producto ${product.name.toUpperCase()} ya existe`,
            vertical: "bottom",
          }
        })
      }
      else {
        products.push(product)
        this.setState({ products }, () => this.updateDBWithChanges(null, [product]))
      }
    }
    //if it's a new product
    else {
      if (this.state.products.some(prod => prod.name.toUpperCase() === product.name.toUpperCase())) {
        this.setState({
          alert: {
            open: true,
            severity: "error",
            message: `El producto ${product.name.toUpperCase()} ya existe`,
            vertical: "bottom",
          }
        })
      }
      else {
        try {
          const newProduct = await this.menuService.addProduct(product)
          products.push(newProduct.data)
          this.setState({ products }, this.closeProductForm())
        }
        catch (error) {
          this.setState({
            alert: {
              open: true,
              severity: "error",
              message: "Error de servidor",
              vertical: "bottom",
            }
          })
        }
      }
    }
  }

  closeProductForm = () => {
    this.setState({ openModal: false, modalProduct: null })
  }

  showProductTooltip = (product) => {
    this.setState({ showProductTooltip: true, tooltipProduct: product })
  }

  hideProductTooltip = () => {
    this.setState({ showProductTooltip: false })
  }

  previewMenu = () => {
    this.setState({ previewMenu: true })
  }

  closePreview = () => {
    this.setState({ previewMenu: false })
  }

  goBack = () => {
    this.props.deselectMenu()
  }

  render() {
    const { palette } = this.context

    return (
      <>
        {this.state.categories
          ? this.state.previewMenu
            ? <Menu
              menu={{ ...this.state.menu }}
              categories={[...this.state.categories]}
              products={this.state.products.filter(prod => {
                return prod.categories.some(cat => {
                  return this.state.categories.some(elm => {
                    return elm._id === cat.id
                  })
                })
              })}
              close={this.closePreview}
            />
            : <>
              <MenuTitleContainer container justify="flex-start">
                {this.state.showMenuInput
                  ? <MenuForm autoComplete="off">
                    <MenuFormFieldContainer container justify="space-between" alignItems="flex-end" wrap="nowrap">
                      <Grid item xs={7} style={{ marginRight: "24px" }}>
                        <TextField
                          fullWidth
                          name="name"
                          label="Nombre de la Carta"
                          type="text"
                          autoFocus
                          value={this.state.menu.name}
                          onChange={this.handleMenuInputChange}
                        />
                      </Grid>
                      <Grid item>
                        <Button variant="outlined" color="primary" style={{ fontFamily: "arial" }}>guardar</Button>
                      </Grid>
                    </MenuFormFieldContainer>
                    <MenuFormFieldContainer container justify="space-between" alignItems="flex-end">
                      <Grid item xs={12}>
                        <TextField
                          style={{ width: '99%', marginTop: '10px' }}
                          name="description"
                          label="Descripción"
                          type="text"
                          value={this.state.menu.description}
                          onChange={this.handleMenuInputChange}
                        />
                      </Grid>
                    </MenuFormFieldContainer>
                  </MenuForm>
                  : <Grid item>
                    <Title variant="h5">
                      {capitalizeTheFirstLetterOfEachWord(this.props.menu.name)}
                    </Title>
                  </Grid>
                }
                {!this.state.showMenuInput &&
                  <Grid item style={{ paddingRight: '10px' }}>
                    <Grid container wrap="nowrap">
                      <Button
                        style={{ minWidth: '0', padding: '5px 12px 5px 0' }}
                        onClick={() => this.toggleMenuInput()}
                        endIcon={<EditIcon />}
                      ></Button>
                      <Button
                        style={{ minWidth: '0', padding: '5px 12px 5px 0' }}
                        onClick={() => this.showConfirmationMessage()}
                        endIcon={<DeleteForeverIcon />}
                      ></Button>
                    </Grid>
                  </Grid>
                }
              </MenuTitleContainer>
              {(!this.state.showMenuInput && this.props.menu.description) &&
                <MenuTitleContainer container justify="flex-start" fontStyle="italic">
                  <Title variant="h6">
                    {this.props.menu.description.slice(0, 1).toUpperCase() + this.props.menu.description.slice(1)}
                  </Title>
                </MenuTitleContainer>
              }

              <SubNavigation goBack={() => this.goBack()} previewMenu={() => this.previewMenu()} />

              <DragDropContext onDragEnd={this.onDragEnd}>
                <Droppable droppableId="menu" type="category">
                  {provided => (
                    <Container width="1008px"
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                    >
                      {this.state.categories
                        .sort((a, b) => a.index - b.index)
                        .map((category, index) => {
                          const products = this.state.products.filter(prod => {
                            return prod.categories.some(cat => {
                              return cat.id === category._id
                            })
                          })
                          return <InnerList
                            key={category._id}
                            category={category}
                            products={products}
                            index={index}
                            showConfirmationMessage={(i, id, category) => this.showConfirmationMessage(i, id, category)}
                            editCategory={(category, i) => this.editCategory(category, i)}
                            openProductForm={(product, category) => this.openProductForm(product, category)}
                            showProductTooltip={(product) => this.showProductTooltip(product)}
                            hideProductTooltip={() => this.hideProductTooltip()}
                          />
                        })}
                      {provided.placeholder}
                    </Container>
                  )}
                </Droppable>
              </DragDropContext>

              <Container width="1008px" margin="0 auto">
                <CategoryForm addCategory={(e, category) => this.addCategory(e, category)} />
              </Container>

              {this.state.showProductTooltip
                ? <ProductTooltip
                  menuDescription={this.props.menu.description ? true : false}
                  product={this.state.tooltipProduct}
                  key={this.state.tooltipProduct._id}
                />
                : this.state.products?.some(prod => {
                  return prod.categories.some(cat => {
                    return this.state.categories.some(elm => {
                      return elm._id === cat.id
                    })
                  })
                })
                && <Tooltip
                  menuDescription={this.props.menu.description ? true : false}
                  palette={palette}
                  padding="20px"
                  font="arial"
                >
                  <Typography variant="h6">
                    <i>Pasa el ratón sobre el producto que quieras para ver sus detalles.</i>
                  </Typography>
                  <Divider style={{ margin: "10px -20px 15px -20px" }} />
                  <Typography variant="subtitle1">
                    Usa los botones que hay a la derecha de los nombres de carta, categoría y producto, para <EditIcon
                      color="primary"
                      fontSize="small"
                      style={{ margin: "0 5px -5px 5px" }}
                    />
                    editar y<DeleteForeverIcon
                      color="primary"
                      fontSize="small"
                      style={{ margin: "0 5px -5px 5px" }}
                    />borrar.
                  </Typography>
                </Tooltip>
              }
            </>
          : <Spinner />
        }
        {this.state.openModal &&
          <ProductForm
            open={this.state.openModal}
            handleClose={() => this.closeProductForm()}
            submitForm={(e, product) => this.submitProductForm(e, product)}
            showAlert={(message, severity, vertical) => this.showAlert(message, severity, vertical)}
            product={this.state.modalProduct}
            otherCategories={this.state.otherCategories}
            otherMenus={this.props.otherMenus}
            key={this.state.modalProduct?._id ? "edit" + this.state.modalProduct._id : this.state.productFormKey}
          />
        }

        <SnackbarAlert
          anchorOrigin={{ vertical: this.state.alert.vertical, horizontal: 'center' }}
          open={this.state.alert.open}
          message={this.state.alert.message}
          severity={this.state.alert.severity}
          i={this.state.alert.i}
          id={this.state.alert.id}
          category={this.state.alert.category}
          closeAlert={(message, severity) => this.closeAlert(message, severity)}
          deleteProduct={(i, category, id) => this.deleteProduct(i, category, id)}
          deleteCategory={(i, id) => this.deleteCategory(i, id)}
          deleteMenu={() => this.props.deleteMenu(this.state.products)}
        />
      </>
    )
  }
}

export default CarteEditor
