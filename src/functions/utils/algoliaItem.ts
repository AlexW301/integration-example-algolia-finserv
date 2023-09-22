import { Elements, ElementType, IContentItem } from "@kontent-ai/delivery-sdk";

export type AlgoliaItem = Readonly<{
  id: string;
  categories: string[];
  hierarchicalCategories: Record<string, string>;
  objectID: string;
  codename: string;
  name: string;
  elements: Object;
  language: string;
  type: string;
  slug: string;
  investmentType: string;
  symbol: string;
  collection: string;
  content: readonly ContentBlock[];
}>;

type ContentBlock = Readonly<{
  id: string;
  codename: string;
  name: string;
  type: string;
  language: string;
  collection: string;
  parents: readonly string[];
  contents: string;
}>;

// My Types
interface Manager {
  elements: {
    full_name: {
      value: string;
    };
  };
}

// Creates an array from strings
function createStringArray(...args: string[]): string[] {
  // Filter out empty strings and return the resulting array
  return args.filter((str) => str !== "");
}

// Creates object from array
function createHierarchicalObject(array: string[]): Record<string, string> {
  let obj: Record<string, string> = {};

  for (let i = 0; i < array.length; i++) {
    if (i === 0) {
      obj[`lvl${i}`] = `${array[i]}`;
    } else {
      let parentKey = `lvl${i - 1}`;
      obj[`lvl${i}`] = `${obj[parentKey]} > ${array[i]}`;
    }
  }

  return obj;
}

export const canConvertToAlgoliaItem = (expectedSlug: string) => (item: IContentItem): boolean =>
  !!item.elements[expectedSlug];

const createObjectId = (itemCodename: string, languageCodename: string) => `${itemCodename}_${languageCodename}`;

export const convertToAlgoliaItem =
  (allItems: ReadonlyMap<string, IContentItem>, expectedSlug: string) => (item: IContentItem): AlgoliaItem => ({
    id: item.system.id,
    categories: createStringArray(item.elements.asset_class.value[0].name, item.elements.category.value[0].name),
    hierarchicalCategories: item.elements?.category ? createHierarchicalObject(createStringArray(item.elements.asset_class.value[0].name, item.elements.category.value[0].name)) : createHierarchicalObject(createStringArray(item.elements.asset_class.value[0].name)),
    type: item.system.type,
    codename: item.system.codename,
    collection: item.system.collection,
    name: item.system.name,
    elements: item.elements,
    investmentType: item.elements.type.value[0].name,
    symbol: item.elements.symbol.value,
    language: item.system.language,
    objectID: createObjectId(item.system.codename, item.system.language),
    slug: Object.values(item.elements).find(el => el.type === ElementType.UrlSlug)?.value ?? "",
    content: createRecordBlock(allItems, [], expectedSlug)(item),
  });

const createRecordBlock =
  (allItems: ReadonlyMap<string, IContentItem>, parentCodenames: ReadonlyArray<string>, expectedSlug: string) =>
    (item: IContentItem): ReadonlyArray<ContentBlock> => {
      const content = Object.values(item.elements)
        .map(element => {
          switch (element.type) {
            case ElementType.Text:
              return element.value ?? "";
            case ElementType.RichText: {
              return element.value?.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").replace(/\n/g, " ") ?? "";
            }
            default:
              return "";
          }
        });

      const children = Object.values(item.elements)
        .flatMap(element => {
          switch (element.type) {
            case ElementType.RichText: {
              const typedElement = element as Elements.RichTextElement;
              return typedElement.linkedItems
                .filter(i => !parentCodenames.includes(i.system.codename))
                .filter(i => !canConvertToAlgoliaItem(expectedSlug)(i))
                .flatMap(createRecordBlock(allItems, [item.system.codename, ...parentCodenames], expectedSlug));
            }
            case ElementType.ModularContent: {
              const typedElement = element as Elements.LinkedItemsElement;
              return typedElement.linkedItems
                .filter(i => !parentCodenames.includes(i.system.codename))
                .filter(i => !canConvertToAlgoliaItem(expectedSlug)(i))
                .flatMap(createRecordBlock(allItems, [item.system.codename, ...parentCodenames], expectedSlug));
            }
            default:
              return [];
          }
        });

      const thisBlock: ContentBlock = {
        id: item.system.id,
        type: item.system.type,
        codename: item.system.codename,
        collection: item.system.collection,
        name: item.system.name,
        language: item.system.language,
        contents: content.join(" ").replace("\"", ""),
        parents: parentCodenames,
      };

      return [thisBlock, ...children];
    };
